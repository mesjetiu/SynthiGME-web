/**
 * PipeWire Audio Stream wrapper for Node.js
 * 
 * Crea un stream de audio con N canales usando libpipewire directamente.
 * Diseñado para baja latencia y control total de los canales.
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
    
    // Escribe samples interleaved (float32)
    // Retorna el número de frames escritos
    size_t write(const float* data, size_t frames);
    
    // Info
    int getChannels() const { return channels_; }
    int getSampleRate() const { return sampleRate_; }
    int getBufferSize() const { return bufferSize_; }
    size_t getUnderflows() const { return underflows_.load(); }
    size_t getBufferedFrames() const { return bufferedFrames_.load(); }

private:
    // PipeWire callbacks (static para usar como C callbacks)
    static void on_process(void* userdata);
    static void on_state_changed(void* userdata, enum pw_stream_state old,
                                  enum pw_stream_state state, const char* error);
    
    void processCallback();
    void runLoop();

    std::string name_;
    int channels_;
    int sampleRate_;
    int bufferSize_;
    
    // PipeWire objects
    struct pw_thread_loop* loop_ = nullptr;
    struct pw_stream* stream_ = nullptr;
    
    // Ring buffer para datos de audio
    std::vector<float> ringBuffer_;
    size_t ringWritePos_ = 0;
    size_t ringReadPos_ = 0;
    std::mutex ringMutex_;
    
    std::atomic<bool> running_{false};
    std::atomic<bool> priming_{true};  // Pre-buffering: no reproduce hasta llenar
    std::atomic<size_t> underflows_{0};
    std::atomic<size_t> bufferedFrames_{0};  // Para métricas de latencia
    
    // Stream events
    struct pw_stream_events events_;
};

#endif // PW_STREAM_H
