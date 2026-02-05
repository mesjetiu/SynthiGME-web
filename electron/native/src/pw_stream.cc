/**
 * PipeWire Audio Stream implementation
 */

#include "pw_stream.h"
#include <cmath>
#include <iostream>

// Valores por defecto de latencia (configurables via setLatency)
// RING_BUFFER_FRAMES: tamaño máximo del ring buffer
// PREBUFFER_FRAMES: cuánto llenar antes de empezar a reproducir (latencia real)
static constexpr size_t DEFAULT_RING_BUFFER_FRAMES = 4096;  // ~85ms @ 48kHz
static constexpr size_t DEFAULT_PREBUFFER_FRAMES = 2048;    // ~42ms @ 48kHz

PwStream::PwStream(const std::string& name, int channels, int sampleRate, int bufferSize)
    : name_(name)
    , channels_(channels)
    , sampleRate_(sampleRate)
    , bufferSize_(bufferSize)
    , prebufferFrames_(DEFAULT_PREBUFFER_FRAMES)
    , ringBufferFrames_(DEFAULT_RING_BUFFER_FRAMES)
{
    // Inicializar ring buffer con tamaño configurable
    ringBuffer_.resize(ringBufferFrames_ * channels_, 0.0f);
    
    // Inicializar eventos
    std::memset(&events_, 0, sizeof(events_));
    events_.version = PW_VERSION_STREAM_EVENTS;
    events_.process = on_process;
    events_.state_changed = on_state_changed;
}

PwStream::~PwStream() {
    stop();
}

bool PwStream::start() {
    if (running_.load()) {
        return true;
    }
    
    // Inicializar PipeWire
    pw_init(nullptr, nullptr);
    
    // Crear thread loop
    loop_ = pw_thread_loop_new("synthigme-audio", nullptr);
    if (!loop_) {
        std::cerr << "[PwStream] Failed to create thread loop" << std::endl;
        return false;
    }
    
    // Crear stream
    // Nombres de puertos: 4 estéreo (Pan 1-4, Pan 5-8) + 8 individuales (Out 1-8)
    struct pw_properties* props = pw_properties_new(
        PW_KEY_MEDIA_TYPE, "Audio",
        PW_KEY_MEDIA_CATEGORY, "Playback",
        PW_KEY_MEDIA_ROLE, "Music",
        PW_KEY_APP_NAME, "SynthiGME",
        PW_KEY_NODE_NAME, name_.c_str(),
        PW_KEY_NODE_DESCRIPTION, "SynthiGME Multichannel Output",
        PW_KEY_NODE_CHANNELNAMES, "[ Pan_1-4_L, Pan_1-4_R, Pan_5-8_L, Pan_5-8_R, Out_1, Out_2, Out_3, Out_4, Out_5, Out_6, Out_7, Out_8 ]",
        nullptr
    );
    
    stream_ = pw_stream_new_simple(
        pw_thread_loop_get_loop(loop_),
        name_.c_str(),
        props,
        &events_,
        this
    );
    
    if (!stream_) {
        std::cerr << "[PwStream] Failed to create stream" << std::endl;
        pw_thread_loop_destroy(loop_);
        loop_ = nullptr;
        return false;
    }
    
    // Configurar formato de audio
    uint8_t buffer[1024];
    struct spa_pod_builder b = SPA_POD_BUILDER_INIT(buffer, sizeof(buffer));
    
    // Crear channel map dinámico para N canales
    // Usamos AUX0, AUX1, ... para canales arbitrarios
    struct spa_audio_info_raw audio_info = {};
    audio_info.format = SPA_AUDIO_FORMAT_F32;
    audio_info.rate = static_cast<uint32_t>(sampleRate_);
    audio_info.channels = static_cast<uint32_t>(channels_);
    
    // Asignar posiciones de canal (AUX0-AUX11 para 12 canales)
    // Los nombres descriptivos se asignan via PW_KEY_NODE_CHANNELNAMES arriba
    for (int i = 0; i < channels_ && i < SPA_AUDIO_MAX_CHANNELS; i++) {
        audio_info.position[i] = SPA_AUDIO_CHANNEL_AUX0 + i;
    }
    
    const struct spa_pod* params[1];
    params[0] = spa_format_audio_raw_build(&b, SPA_PARAM_EnumFormat, &audio_info);
    
    // Conectar stream
    int res = pw_stream_connect(
        stream_,
        PW_DIRECTION_OUTPUT,
        PW_ID_ANY,
        static_cast<pw_stream_flags>(
            PW_STREAM_FLAG_AUTOCONNECT |
            PW_STREAM_FLAG_MAP_BUFFERS |
            PW_STREAM_FLAG_RT_PROCESS
        ),
        params, 1
    );
    
    if (res < 0) {
        std::cerr << "[PwStream] Failed to connect stream: " << res << std::endl;
        pw_stream_destroy(stream_);
        pw_thread_loop_destroy(loop_);
        stream_ = nullptr;
        loop_ = nullptr;
        return false;
    }
    
    // Iniciar loop
    running_.store(true);
    priming_.store(true);  // Empezar en modo pre-buffering
    pw_thread_loop_start(loop_);
    
    std::cout << "[PwStream] Started: " << name_ 
              << " (" << channels_ << "ch @ " << sampleRate_ << "Hz, prebuffer: "
              << prebufferFrames_ << " frames, ~" << (prebufferFrames_ * 1000 / sampleRate_) << "ms)" << std::endl;
    
    return true;
}

void PwStream::stop() {
    if (!running_.load()) {
        return;
    }
    
    running_.store(false);
    
    if (loop_) {
        pw_thread_loop_stop(loop_);
    }
    
    if (stream_) {
        pw_stream_destroy(stream_);
        stream_ = nullptr;
    }
    
    if (loop_) {
        pw_thread_loop_destroy(loop_);
        loop_ = nullptr;
    }
    
    pw_deinit();
    
    std::cout << "[PwStream] Stopped. Underflows: " << underflows_.load() << std::endl;
}

size_t PwStream::write(const float* data, size_t frames) {
    if (!running_.load() || !data || frames == 0) {
        return 0;
    }
    
    const size_t samples = frames * channels_;
    const size_t ringSize = ringBuffer_.size();
    
    std::lock_guard<std::mutex> lock(ringMutex_);
    
    // Calcular espacio disponible
    size_t available;
    if (ringWritePos_ >= ringReadPos_) {
        available = ringSize - (ringWritePos_ - ringReadPos_) - channels_;
    } else {
        available = ringReadPos_ - ringWritePos_ - channels_;
    }
    
    // Limitar a espacio disponible
    size_t toWrite = std::min(samples, available);
    size_t framesWritten = toWrite / channels_;
    
    // Contar overflow si no caben todos los datos
    if (toWrite < samples) {
        overflows_.fetch_add(1);
    }
    
    // Copiar datos al ring buffer
    for (size_t i = 0; i < toWrite; i++) {
        ringBuffer_[ringWritePos_] = data[i];
        ringWritePos_ = (ringWritePos_ + 1) % ringSize;
    }
    
    // Actualizar contador de frames en buffer (para métricas)
    size_t buffered;
    if (ringWritePos_ >= ringReadPos_) {
        buffered = (ringWritePos_ - ringReadPos_) / channels_;
    } else {
        buffered = (ringSize - ringReadPos_ + ringWritePos_) / channels_;
    }
    bufferedFrames_.store(buffered);
    
    // Salir de priming cuando hay suficiente buffer
    if (priming_.load() && buffered >= prebufferFrames_) {
        priming_.store(false);
        std::cout << "[PwStream] Pre-buffer lleno, iniciando reproducción" << std::endl;
    }
    
    return framesWritten;
}

void PwStream::on_process(void* userdata) {
    auto* self = static_cast<PwStream*>(userdata);
    self->processCallback();
}

void PwStream::on_state_changed(void* userdata, enum pw_stream_state old,
                                 enum pw_stream_state state, const char* error) {
    auto* self = static_cast<PwStream*>(userdata);
    
    const char* stateStr = pw_stream_state_as_string(state);
    std::cout << "[PwStream] State: " << stateStr;
    if (error) {
        std::cout << " (error: " << error << ")";
    }
    std::cout << std::endl;
}

void PwStream::processCallback() {
    struct pw_buffer* pwBuf = pw_stream_dequeue_buffer(stream_);
    if (!pwBuf) {
        return;
    }
    
    struct spa_buffer* buf = pwBuf->buffer;
    float* dst = static_cast<float*>(buf->datas[0].data);
    
    if (!dst) {
        pw_stream_queue_buffer(stream_, pwBuf);
        return;
    }
    
    // Calcular frames a procesar
    uint32_t stride = sizeof(float) * channels_;
    uint32_t maxFrames = buf->datas[0].maxsize / stride;
    uint32_t frames = pwBuf->requested ? 
                      std::min(static_cast<uint32_t>(pwBuf->requested), maxFrames) : 
                      maxFrames;
    
    const size_t samples = frames * channels_;
    
    // ═══════════════════════════════════════════════════════════════════════
    // Modo SharedArrayBuffer: lectura lock-free directa
    // ═══════════════════════════════════════════════════════════════════════
    if (sharedBuffer_) {
        // Primero transferir del SharedArrayBuffer al ring buffer interno
        // para mantener el mecanismo de pre-buffering
        float tempBuf[2048 * 12]; // max 2048 frames * 12 channels
        size_t transferred = readFromSharedBuffer(tempBuf, 2048);
        
        if (transferred > 0) {
            // Escribir al ring buffer interno
            std::lock_guard<std::mutex> lock(ringMutex_);
            const size_t ringSize = ringBuffer_.size();
            const size_t samplesToWrite = transferred * channels_;
            
            for (size_t i = 0; i < samplesToWrite; i++) {
                ringBuffer_[ringWritePos_] = tempBuf[i];
                ringWritePos_ = (ringWritePos_ + 1) % ringSize;
            }
            
            // Actualizar bufferedFrames y salir de priming si corresponde
            size_t buffered;
            if (ringWritePos_ >= ringReadPos_) {
                buffered = (ringWritePos_ - ringReadPos_) / channels_;
            } else {
                buffered = (ringSize - ringReadPos_ + ringWritePos_) / channels_;
            }
            bufferedFrames_.store(buffered);
            
            if (priming_.load() && buffered >= prebufferFrames_) {
                priming_.store(false);
                std::cout << "[PwStream] SharedArrayBuffer: pre-buffer lleno" << std::endl;
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // Leer del ring buffer interno (común para ambos modos)
    // ═══════════════════════════════════════════════════════════════════════
    const size_t ringSize = ringBuffer_.size();
    
    {
        std::lock_guard<std::mutex> lock(ringMutex_);
        
        // Calcular datos disponibles
        size_t available;
        if (ringWritePos_ >= ringReadPos_) {
            available = ringWritePos_ - ringReadPos_;
        } else {
            available = ringSize - ringReadPos_ + ringWritePos_;
        }
        
        // Si estamos en priming O no hay suficientes datos, enviar silencio
        if (priming_.load() || available < samples) {
            std::memset(dst, 0, samples * sizeof(float));
            buf->datas[0].chunk->offset = 0;
            buf->datas[0].chunk->stride = stride;
            buf->datas[0].chunk->size = frames * stride;
            pw_stream_queue_buffer(stream_, pwBuf);
            // Contar silent underflow si NO estamos en priming
            if (!priming_.load() && available < samples) {
                silentUnderflows_.fetch_add(1);
            }
            return;
        }
        
        // Copiar datos
        for (size_t i = 0; i < samples; i++) {
            dst[i] = ringBuffer_[ringReadPos_];
            ringReadPos_ = (ringReadPos_ + 1) % ringSize;
        }
    }
    
    buf->datas[0].chunk->offset = 0;
    buf->datas[0].chunk->stride = stride;
    buf->datas[0].chunk->size = frames * stride;
    
    pw_stream_queue_buffer(stream_, pwBuf);
}

// ═══════════════════════════════════════════════════════════════════════════
// SharedArrayBuffer support - lectura lock-free desde memoria compartida
// ═══════════════════════════════════════════════════════════════════════════

bool PwStream::attachSharedBuffer(void* buffer, size_t bufferSize, size_t bufferFrames) {
    if (!buffer || bufferSize == 0 || bufferFrames == 0) {
        std::cerr << "[PwStream] Invalid SharedArrayBuffer parameters" << std::endl;
        return false;
    }
    
    // Layout esperado:
    // [0-3]: writeIndex (int32_t, atomic)
    // [4-7]: readIndex (int32_t, atomic)
    // [8+]:  audioData (float32 interleaved)
    size_t minSize = 8 + (bufferFrames * channels_ * sizeof(float));
    if (bufferSize < minSize) {
        std::cerr << "[PwStream] SharedArrayBuffer too small: " << bufferSize 
                  << " < " << minSize << std::endl;
        return false;
    }
    
    sharedBuffer_ = buffer;
    sharedBufferSize_ = bufferSize;
    sharedBufferFrames_ = bufferFrames;
    
    // Mapear punteros a las regiones del buffer
    int32_t* controlArea = static_cast<int32_t*>(buffer);
    sharedWriteIndex_ = reinterpret_cast<std::atomic<int32_t>*>(&controlArea[0]);
    sharedReadIndex_ = reinterpret_cast<std::atomic<int32_t>*>(&controlArea[1]);
    
    // Audio data empieza en offset 8 (después de los 2 int32)
    uint8_t* bytePtr = static_cast<uint8_t*>(buffer);
    sharedAudioData_ = reinterpret_cast<float*>(bytePtr + 8);
    
    // Inicializar readIndex a 0
    sharedReadIndex_->store(0, std::memory_order_release);
    
    std::cout << "[PwStream] SharedArrayBuffer attached: " << bufferFrames 
              << " frames, " << channels_ << " channels" << std::endl;
    
    return true;
}

void PwStream::detachSharedBuffer() {
    sharedBuffer_ = nullptr;
    sharedBufferSize_ = 0;
    sharedBufferFrames_ = 0;
    sharedWriteIndex_ = nullptr;
    sharedReadIndex_ = nullptr;
    sharedAudioData_ = nullptr;
    
    std::cout << "[PwStream] SharedArrayBuffer detached" << std::endl;
}

size_t PwStream::readFromSharedBuffer(float* dest, size_t maxFrames) {
    if (!sharedBuffer_ || !sharedWriteIndex_ || !sharedReadIndex_ || !sharedAudioData_) {
        return 0;
    }
    
    // Leer índices atómicamente
    int32_t writeIdx = sharedWriteIndex_->load(std::memory_order_acquire);
    int32_t readIdx = sharedReadIndex_->load(std::memory_order_relaxed);
    
    // Calcular frames disponibles
    int32_t available;
    if (writeIdx >= readIdx) {
        available = writeIdx - readIdx;
    } else {
        available = sharedBufferFrames_ - readIdx + writeIdx;
    }
    
    if (available <= 0) {
        return 0;
    }
    
    // Limitar a lo solicitado
    size_t toRead = std::min(static_cast<size_t>(available), maxFrames);
    
    // Copiar datos (interleaved)
    int32_t pos = readIdx;
    for (size_t frame = 0; frame < toRead; frame++) {
        size_t baseIndex = pos * channels_;
        for (int ch = 0; ch < channels_; ch++) {
            dest[frame * channels_ + ch] = sharedAudioData_[baseIndex + ch];
        }
        pos = (pos + 1) % sharedBufferFrames_;
    }
    
    // Actualizar readIndex atómicamente
    sharedReadIndex_->store(pos, std::memory_order_release);
    
    return toRead;
}

// ═══════════════════════════════════════════════════════════════════════════
// Configuración de latencia
// ═══════════════════════════════════════════════════════════════════════════

void PwStream::setLatency(size_t prebufferFrames, size_t ringBufferFrames) {
    if (running_.load()) {
        std::cerr << "[PwStream] WARNING: setLatency llamado con stream activo, ignorando" << std::endl;
        return;
    }
    
    // Validar rangos razonables (min 256 frames ~5ms, max 16384 frames ~340ms @ 48kHz)
    prebufferFrames_ = std::max<size_t>(256, std::min<size_t>(16384, prebufferFrames));
    ringBufferFrames_ = std::max<size_t>(prebufferFrames_ * 2, std::min<size_t>(32768, ringBufferFrames));
    
    // Redimensionar ring buffer
    ringBuffer_.resize(ringBufferFrames_ * channels_, 0.0f);
    ringWritePos_ = 0;
    ringReadPos_ = 0;
    
    std::cout << "[PwStream] Latencia configurada: prebuffer=" << prebufferFrames_ 
              << " frames, ringbuffer=" << ringBufferFrames_ << " frames" << std::endl;
}
