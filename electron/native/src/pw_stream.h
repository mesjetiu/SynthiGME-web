/**
 * PipeWire Audio Stream wrapper for Node.js
 * 
 * Crea un stream de audio con N canales usando libpipewire directamente.
 * Diseñado para baja latencia y control total de los canales.
 * 
 * Soporta dos modos de alimentación:
 * 1. write() - llamadas explícitas desde JS
 * 2. SharedArrayBuffer - lectura directa desde memoria compartida (lock-free)
 */

#ifndef PW_STREAM_H
#define PW_STREAM_H

#include <pipewire/pipewire.h>
#include <spa/param/audio/format-utils.h>
#include <spa/param/props.h>

#include <atomic>
#include <mutex>
#include <vector>
#include <string>
#include <cstring>
#include <thread>
#include <condition_variable>

class PwStream {
public:
    PwStream(const std::string& name, int channels, int sampleRate, int bufferSize);
    ~PwStream();

    bool start();
    void stop();
    bool isRunning() const { return running_.load(); }
    
    // Modo 1: Escribe samples interleaved (float32) via llamadas JS
    size_t write(const float* data, size_t frames);
    
    // Modo 2: Configura lectura desde SharedArrayBuffer
    // buffer layout: [writeIndex(int32), readIndex(int32), audioData(float32[])]
    bool attachSharedBuffer(void* buffer, size_t bufferSize, size_t bufferFrames);
    void detachSharedBuffer();
    bool hasSharedBuffer() const { return sharedBuffer_ != nullptr; }
    
    // Configuración de latencia (debe llamarse ANTES de start())
    void setLatency(size_t prebufferFrames, size_t ringBufferFrames);
    size_t getPrebufferFrames() const { return prebufferFrames_; }
    size_t getRingBufferFrames() const { return ringBufferFrames_; }
    
    // Info
    int getChannels() const { return channels_; }
    int getSampleRate() const { return sampleRate_; }
    int getBufferSize() const { return bufferSize_; }
    size_t getUnderflows() const { return underflows_.load(); }
    size_t getOverflows() const { return overflows_.load(); }
    size_t getSilentUnderflows() const { return silentUnderflows_.load(); }
    size_t getBufferedFrames() const { return bufferedFrames_.load(); }

private:
    // PipeWire callbacks (static para usar como C callbacks)
    static void on_process(void* userdata);
    static void on_state_changed(void* userdata, enum pw_stream_state old,
                                  enum pw_stream_state state, const char* error);
    
    void processCallback();
    void runLoop();
    
    // Lee datos del SharedArrayBuffer si está conectado
    size_t readFromSharedBuffer(float* dest, size_t maxFrames);

    std::string name_;
    int channels_;
    int sampleRate_;
    int bufferSize_;
    
    // Configuración de latencia (configurable antes de start)
    size_t prebufferFrames_ = 2048;   // ~42ms @ 48kHz por defecto
    size_t ringBufferFrames_ = 4096;  // ~85ms @ 48kHz por defecto
    
    // PipeWire objects
    struct pw_thread_loop* loop_ = nullptr;
    struct pw_stream* stream_ = nullptr;
    
    // Ring buffer interno para datos de audio (usado con write())
    std::vector<float> ringBuffer_;
    size_t ringWritePos_ = 0;
    size_t ringReadPos_ = 0;
    std::mutex ringMutex_;
    
    // SharedArrayBuffer externo (alternativa lock-free a write())
    void* sharedBuffer_ = nullptr;
    size_t sharedBufferSize_ = 0;
    size_t sharedBufferFrames_ = 0;
    // Offsets en el SharedArrayBuffer
    std::atomic<int32_t>* sharedWriteIndex_ = nullptr;
    std::atomic<int32_t>* sharedReadIndex_ = nullptr;
    float* sharedAudioData_ = nullptr;
    
    std::atomic<bool> running_{false};
    std::atomic<bool> priming_{true};  // Pre-buffering: no reproduce hasta llenar
    std::atomic<size_t> underflows_{0};
    std::atomic<size_t> overflows_{0};  // Datos descartados por buffer lleno
    std::atomic<size_t> silentUnderflows_{0};  // Silencio enviado por buffer bajo
    std::atomic<size_t> bufferedFrames_{0};  // Para métricas de latencia
    
    // Stream events
    struct pw_stream_events events_;
};

#endif // PW_STREAM_H
