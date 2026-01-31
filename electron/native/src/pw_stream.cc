/**
 * PipeWire Audio Stream implementation
 */

#include "pw_stream.h"
#include <cmath>
#include <iostream>

// Ring buffer size: ~32ms de audio a 48kHz, 8 canales
// Optimizado para baja latencia (20-40ms objetivo)
static constexpr size_t RING_BUFFER_FRAMES = 1536;

// Pre-buffering: frames mínimos antes de empezar a reproducir (~16ms)
// Absorbe jitter del IPC sin añadir latencia excesiva
static constexpr size_t PREBUFFER_FRAMES = 768;

PwStream::PwStream(const std::string& name, int channels, int sampleRate, int bufferSize)
    : name_(name)
    , channels_(channels)
    , sampleRate_(sampleRate)
    , bufferSize_(bufferSize)
{
    // Inicializar ring buffer
    ringBuffer_.resize(RING_BUFFER_FRAMES * channels_, 0.0f);
    
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
    struct pw_properties* props = pw_properties_new(
        PW_KEY_MEDIA_TYPE, "Audio",
        PW_KEY_MEDIA_CATEGORY, "Playback",
        PW_KEY_MEDIA_ROLE, "Music",
        PW_KEY_APP_NAME, "SynthiGME",
        PW_KEY_NODE_NAME, name_.c_str(),
        PW_KEY_NODE_DESCRIPTION, "SynthiGME Multichannel Output",
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
    
    // Asignar posiciones de canal (AUX0-AUX7 para 8 canales)
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
              << PREBUFFER_FRAMES << " frames)" << std::endl;
    
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
    if (priming_.load() && buffered >= PREBUFFER_FRAMES) {
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
    const size_t ringSize = ringBuffer_.size();
    
    // Si estamos en modo priming, solo enviar silencio
    if (priming_.load()) {
        std::memset(dst, 0, samples * sizeof(float));
        buf->datas[0].chunk->offset = 0;
        buf->datas[0].chunk->stride = stride;
        buf->datas[0].chunk->size = frames * stride;
        pw_stream_queue_buffer(stream_, pwBuf);
        return;
    }
    
    // Leer del ring buffer
    {
        std::lock_guard<std::mutex> lock(ringMutex_);
        
        // Calcular datos disponibles
        size_t available;
        if (ringWritePos_ >= ringReadPos_) {
            available = ringWritePos_ - ringReadPos_;
        } else {
            available = ringSize - ringReadPos_ + ringWritePos_;
        }
        
        size_t toRead = std::min(samples, available);
        
        // Copiar datos
        for (size_t i = 0; i < toRead; i++) {
            dst[i] = ringBuffer_[ringReadPos_];
            ringReadPos_ = (ringReadPos_ + 1) % ringSize;
        }
        
        // Rellenar con silencio si no hay suficientes datos
        if (toRead < samples) {
            std::memset(dst + toRead, 0, (samples - toRead) * sizeof(float));
            if (running_.load()) {
                underflows_.fetch_add(1);
                // Re-entrar en modo priming si el buffer se vació completamente
                if (available == 0) {
                    priming_.store(true);
                }
            }
        }
    }
    
    buf->datas[0].chunk->offset = 0;
    buf->datas[0].chunk->stride = stride;
    buf->datas[0].chunk->size = frames * stride;
    
    pw_stream_queue_buffer(stream_, pwBuf);
}
