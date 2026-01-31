/**
 * Node.js N-API binding for PipeWire Audio
 * 
 * Expone PwStream como objeto JavaScript con métodos:
 * - new PipeWireAudio(name, channels, sampleRate, bufferSize)
 * - start() -> bool
 * - stop()
 * - write(Float32Array) -> number (frames written)
 * - isRunning -> bool
 * - channels -> number
 * - sampleRate -> number
 * - underflows -> number
 */

#include <napi.h>
#include "pw_stream.h"
#include <memory>

class PipeWireAudio : public Napi::ObjectWrap<PipeWireAudio> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    PipeWireAudio(const Napi::CallbackInfo& info);
    ~PipeWireAudio();

private:
    Napi::Value Start(const Napi::CallbackInfo& info);
    Napi::Value Stop(const Napi::CallbackInfo& info);
    Napi::Value Write(const Napi::CallbackInfo& info);
    Napi::Value IsRunning(const Napi::CallbackInfo& info);
    Napi::Value GetChannels(const Napi::CallbackInfo& info);
    Napi::Value GetSampleRate(const Napi::CallbackInfo& info);
    Napi::Value GetUnderflows(const Napi::CallbackInfo& info);
    Napi::Value GetBufferedFrames(const Napi::CallbackInfo& info);
    
    std::unique_ptr<PwStream> stream_;
};

Napi::Object PipeWireAudio::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "PipeWireAudio", {
        InstanceMethod<&PipeWireAudio::Start>("start"),
        InstanceMethod<&PipeWireAudio::Stop>("stop"),
        InstanceMethod<&PipeWireAudio::Write>("write"),
        InstanceAccessor<&PipeWireAudio::IsRunning>("isRunning"),
        InstanceAccessor<&PipeWireAudio::GetChannels>("channels"),
        InstanceAccessor<&PipeWireAudio::GetSampleRate>("sampleRate"),
        InstanceAccessor<&PipeWireAudio::GetUnderflows>("underflows"),
        InstanceAccessor<&PipeWireAudio::GetBufferedFrames>("bufferedFrames"),
    });
    
    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);
    
    exports.Set("PipeWireAudio", func);
    return exports;
}

PipeWireAudio::PipeWireAudio(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<PipeWireAudio>(info) 
{
    Napi::Env env = info.Env();
    
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected 4 arguments: name, channels, sampleRate, bufferSize")
            .ThrowAsJavaScriptException();
        return;
    }
    
    std::string name = info[0].As<Napi::String>().Utf8Value();
    int channels = info[1].As<Napi::Number>().Int32Value();
    int sampleRate = info[2].As<Napi::Number>().Int32Value();
    int bufferSize = info[3].As<Napi::Number>().Int32Value();
    
    // Validar parámetros
    if (channels < 1 || channels > 64) {
        Napi::RangeError::New(env, "Channels must be between 1 and 64")
            .ThrowAsJavaScriptException();
        return;
    }
    
    if (sampleRate < 8000 || sampleRate > 192000) {
        Napi::RangeError::New(env, "Sample rate must be between 8000 and 192000")
            .ThrowAsJavaScriptException();
        return;
    }
    
    stream_ = std::make_unique<PwStream>(name, channels, sampleRate, bufferSize);
}

PipeWireAudio::~PipeWireAudio() {
    if (stream_) {
        stream_->stop();
    }
}

Napi::Value PipeWireAudio::Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!stream_) {
        return Napi::Boolean::New(env, false);
    }
    
    bool result = stream_->start();
    return Napi::Boolean::New(env, result);
}

Napi::Value PipeWireAudio::Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (stream_) {
        stream_->stop();
    }
    
    return env.Undefined();
}

Napi::Value PipeWireAudio::Write(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!stream_ || !stream_->isRunning()) {
        return Napi::Number::New(env, 0);
    }
    
    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected Float32Array argument")
            .ThrowAsJavaScriptException();
        return Napi::Number::New(env, 0);
    }
    
    Napi::TypedArray typedArray = info[0].As<Napi::TypedArray>();
    
    if (typedArray.TypedArrayType() != napi_float32_array) {
        Napi::TypeError::New(env, "Expected Float32Array argument")
            .ThrowAsJavaScriptException();
        return Napi::Number::New(env, 0);
    }
    
    Napi::Float32Array float32Array = info[0].As<Napi::Float32Array>();
    const float* data = float32Array.Data();
    size_t length = float32Array.ElementLength();
    
    int channels = stream_->getChannels();
    size_t frames = length / channels;
    
    size_t written = stream_->write(data, frames);
    return Napi::Number::New(env, static_cast<double>(written));
}

Napi::Value PipeWireAudio::IsRunning(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    bool running = stream_ && stream_->isRunning();
    return Napi::Boolean::New(env, running);
}

Napi::Value PipeWireAudio::GetChannels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    int channels = stream_ ? stream_->getChannels() : 0;
    return Napi::Number::New(env, channels);
}

Napi::Value PipeWireAudio::GetSampleRate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    int rate = stream_ ? stream_->getSampleRate() : 0;
    return Napi::Number::New(env, rate);
}

Napi::Value PipeWireAudio::GetUnderflows(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    size_t underflows = stream_ ? stream_->getUnderflows() : 0;
    return Napi::Number::New(env, static_cast<double>(underflows));
}

Napi::Value PipeWireAudio::GetBufferedFrames(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    size_t frames = stream_ ? stream_->getBufferedFrames() : 0;
    return Napi::Number::New(env, static_cast<double>(frames));
}

// Inicialización del módulo
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return PipeWireAudio::Init(env, exports);
}

NODE_API_MODULE(pipewire_audio, Init)
