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
#include <iostream>

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
    Napi::Value GetOverflows(const Napi::CallbackInfo& info);
    Napi::Value GetSilentUnderflows(const Napi::CallbackInfo& info);
    Napi::Value GetBufferedFrames(const Napi::CallbackInfo& info);
    
    // SharedArrayBuffer methods
    Napi::Value AttachSharedBuffer(const Napi::CallbackInfo& info);
    Napi::Value DetachSharedBuffer(const Napi::CallbackInfo& info);
    Napi::Value HasSharedBuffer(const Napi::CallbackInfo& info);
    
    std::unique_ptr<PwStream> stream_;
};

Napi::Object PipeWireAudio::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "PipeWireAudio", {
        InstanceMethod<&PipeWireAudio::Start>("start"),
        InstanceMethod<&PipeWireAudio::Stop>("stop"),
        InstanceMethod<&PipeWireAudio::Write>("write"),
        InstanceMethod<&PipeWireAudio::AttachSharedBuffer>("attachSharedBuffer"),
        InstanceMethod<&PipeWireAudio::DetachSharedBuffer>("detachSharedBuffer"),
        InstanceAccessor<&PipeWireAudio::IsRunning>("isRunning"),
        InstanceAccessor<&PipeWireAudio::HasSharedBuffer>("hasSharedBuffer"),
        InstanceAccessor<&PipeWireAudio::GetChannels>("channels"),
        InstanceAccessor<&PipeWireAudio::GetSampleRate>("sampleRate"),
        InstanceAccessor<&PipeWireAudio::GetUnderflows>("underflows"),
        InstanceAccessor<&PipeWireAudio::GetOverflows>("overflows"),
        InstanceAccessor<&PipeWireAudio::GetSilentUnderflows>("silentUnderflows"),
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

Napi::Value PipeWireAudio::GetOverflows(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    size_t overflows = stream_ ? stream_->getOverflows() : 0;
    return Napi::Number::New(env, static_cast<double>(overflows));
}

Napi::Value PipeWireAudio::GetSilentUnderflows(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    size_t silentUnderflows = stream_ ? stream_->getSilentUnderflows() : 0;
    return Napi::Number::New(env, static_cast<double>(silentUnderflows));
}

Napi::Value PipeWireAudio::GetBufferedFrames(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    size_t frames = stream_ ? stream_->getBufferedFrames() : 0;
    return Napi::Number::New(env, static_cast<double>(frames));
}

// ═══════════════════════════════════════════════════════════════════════════
// SharedArrayBuffer methods
// ═══════════════════════════════════════════════════════════════════════════

Napi::Value PipeWireAudio::AttachSharedBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!stream_) {
        Napi::Error::New(env, "Stream not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected arguments: typedArray (wrapping SAB), bufferFrames")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    void* data = nullptr;
    size_t byteLength = 0;
    
    // Estrategia: recibir un TypedArray (Int32Array) que envuelve el SharedArrayBuffer
    // Esto funciona porque TypedArray.buffer devuelve el SharedArrayBuffer subyacente
    if (info[0].IsTypedArray()) {
        Napi::TypedArray typedArray = info[0].As<Napi::TypedArray>();
        Napi::ArrayBuffer arrayBuffer = typedArray.ArrayBuffer();
        data = arrayBuffer.Data();
        byteLength = arrayBuffer.ByteLength();
        std::cout << "[PwAudio] Got data from TypedArray, byteLength=" << byteLength << std::endl;
    } else if (info[0].IsArrayBuffer()) {
        Napi::ArrayBuffer arrayBuffer = info[0].As<Napi::ArrayBuffer>();
        data = arrayBuffer.Data();
        byteLength = arrayBuffer.ByteLength();
        std::cout << "[PwAudio] Got data from ArrayBuffer, byteLength=" << byteLength << std::endl;
    } else {
        // Último intento: raw napi
        napi_value val = info[0];
        bool isArrayBuffer = false;
        napi_is_arraybuffer(env, val, &isArrayBuffer);
        
        if (isArrayBuffer) {
            napi_get_arraybuffer_info(env, val, &data, &byteLength);
            std::cout << "[PwAudio] Got data from raw napi, byteLength=" << byteLength << std::endl;
        } else {
            std::cerr << "[PwAudio] Invalid argument type" << std::endl;
            Napi::TypeError::New(env, "First argument must be a TypedArray or ArrayBuffer")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
    }
    
    if (!data || byteLength == 0) {
        std::cerr << "[PwAudio] No data or zero length" << std::endl;
        return Napi::Boolean::New(env, false);
    }
    
    size_t bufferFrames = info[1].As<Napi::Number>().Uint32Value();
    
    std::cout << "[PwAudio] AttachSharedBuffer: data=" << data 
              << ", byteLength=" << byteLength 
              << ", frames=" << bufferFrames << std::endl;
    
    bool success = stream_->attachSharedBuffer(data, byteLength, bufferFrames);
    
    return Napi::Boolean::New(env, success);
}

Napi::Value PipeWireAudio::DetachSharedBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (stream_) {
        stream_->detachSharedBuffer();
    }
    
    return env.Undefined();
}

Napi::Value PipeWireAudio::HasSharedBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    bool has = stream_ ? stream_->hasSharedBuffer() : false;
    return Napi::Boolean::New(env, has);
}

// Inicialización del módulo
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return PipeWireAudio::Init(env, exports);
}

NODE_API_MODULE(pipewire_audio, Init)
