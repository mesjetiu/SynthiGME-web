{
  "targets": [
    {
      "target_name": "pipewire_audio",
      "sources": [
        "src/pipewire_audio.cc",
        "src/pw_stream.cc"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "cflags": [
        "<!@(pkg-config --cflags libpipewire-0.3)"
      ],
      "libraries": [
        "<!@(pkg-config --libs libpipewire-0.3)"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-std=c++17", "-fexceptions"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS=0", "NODE_ADDON_API_ENABLE_MAYBE"],
      "conditions": [
        ["OS=='linux'", {
          "defines": ["__LINUX__"]
        }]
      ]
    }
  ]
}
