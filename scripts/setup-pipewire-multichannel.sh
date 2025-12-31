#!/bin/bash
#
# SynthiGME-web: PipeWire Multichannel Setup Script
# ==================================================
#
# Este script configura sinks virtuales en PipeWire para permitir
# ruteo multicanal desde la aplicación web hacia hardware físico.
#
# Uso:
#   ./setup-pipewire-multichannel.sh [--install|--uninstall|--status|--help]
#
# Requisitos:
#   - PipeWire como servidor de audio
#   - pactl (pipewire-pulse o pulseaudio-utils)
#   - pw-link (pipewire-tools)
#

set -e

# Configuración
SINK_PREFIX="synthigme"
NUM_STEREO_SINKS=4  # 4 sinks estéreo = 8 canales lógicos

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Funciones auxiliares ---

print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║          SynthiGME-web - PipeWire Multichannel Setup          ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# --- Verificaciones ---

check_pipewire() {
    if ! pactl info 2>/dev/null | grep -q "PipeWire"; then
        print_error "PipeWire no está activo como servidor de audio"
        echo "  Este script requiere PipeWire. Verifica tu instalación."
        exit 1
    fi
    print_success "PipeWire detectado como servidor de audio"
}

check_tools() {
    local missing=()
    
    if ! command -v pactl &> /dev/null; then
        missing+=("pactl (pipewire-pulse)")
    fi
    
    if ! command -v pw-link &> /dev/null; then
        missing+=("pw-link (pipewire-tools)")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        print_error "Herramientas requeridas no encontradas:"
        for tool in "${missing[@]}"; do
            echo "  - $tool"
        done
        exit 1
    fi
    print_success "Herramientas requeridas disponibles"
}

# --- Gestión de sinks ---

create_sinks() {
    print_info "Creando $NUM_STEREO_SINKS sinks virtuales estéreo..."
    
    for i in $(seq 1 $NUM_STEREO_SINKS); do
        local sink_name="${SINK_PREFIX}_bus_$((i*2-1))_$((i*2))"
        local description="SynthiGME Bus $((i*2-1))-$((i*2))"
        
        # Verificar si ya existe
        if pactl list short sinks 2>/dev/null | grep -q "$sink_name"; then
            print_warning "Sink $sink_name ya existe, saltando..."
            continue
        fi
        
        # Crear el sink (sintaxis compatible PulseAudio/PipeWire)
        pactl load-module module-null-sink \
            sink_name="$sink_name" \
            sink_properties="device.description='$description'" \
            >/dev/null 2>&1 || {
                print_error "Error creando sink $sink_name"
                continue
            }
        
        print_success "Creado: $sink_name ($description)"
    done
}

remove_sinks() {
    print_info "Eliminando sinks virtuales de SynthiGME..."
    
    # Obtener IDs de módulos con nuestro prefijo
    local modules=$(pactl list short modules 2>/dev/null | grep "module-null-sink" | grep "$SINK_PREFIX" | cut -f1)
    
    if [ -z "$modules" ]; then
        print_warning "No se encontraron sinks de SynthiGME para eliminar"
        return
    fi
    
    for module_id in $modules; do
        pactl unload-module "$module_id" 2>/dev/null && \
            print_success "Eliminado módulo $module_id" || \
            print_error "Error eliminando módulo $module_id"
    done
}

show_status() {
    print_info "Estado actual de sinks SynthiGME:"
    echo ""
    
    local sinks=$(pactl list short sinks 2>/dev/null | grep "$SINK_PREFIX" || true)
    
    if [ -z "$sinks" ]; then
        print_warning "No hay sinks de SynthiGME activos"
        return
    fi
    
    echo "$sinks" | while read -r line; do
        local name=$(echo "$line" | cut -f2)
        print_success "$name"
    done
    
    echo ""
    print_info "Dispositivos de salida físicos disponibles:"
    pactl list short sinks 2>/dev/null | grep -v "$SINK_PREFIX" | grep -v ".monitor" | while read -r line; do
        local name=$(echo "$line" | cut -f2)
        echo "  - $name"
    done
}

list_physical_outputs() {
    print_info "Dispositivos de salida físicos detectados:"
    echo ""
    
    pw-cli list-objects Node 2>/dev/null | grep -A 10 "type PipeWire:Interface:Node" | \
        grep -E "node.name|media.class" | paste - - | \
        grep "Audio/Sink" | grep -v "null" | grep -v "$SINK_PREFIX" | \
        sed 's/.*node.name = "\([^"]*\)".*/  - \1/' || \
        pactl list short sinks 2>/dev/null | grep "alsa_output" | cut -f2 | sed 's/^/  - /'
}

# --- Ruteo automático ---

auto_route() {
    print_info "Buscando dispositivos de salida Behringer/USB..."
    
    # Buscar todos los sinks de la interfaz USB
    local usb_sinks=$(pw-link -i 2>/dev/null | grep "alsa_output" | grep -iE "usb|behringer|focusrite|scarlett|presonus|motu|steinberg" | grep "playback_FL" | sed 's/:playback_FL//' | sort -u)
    
    if [ -z "$usb_sinks" ]; then
        # Intentar con el sink por defecto
        local default_sink=$(pactl get-default-sink 2>/dev/null)
        if [ -n "$default_sink" ]; then
            usb_sinks="$default_sink"
        else
            print_error "No se encontraron interfaces de audio USB"
            echo "  Usa qpwgraph para configurar manualmente"
            return 1
        fi
    fi
    
    # Contar sinks disponibles
    local sink_count=$(echo "$usb_sinks" | wc -l)
    print_success "Encontrados $sink_count dispositivos de salida"
    
    # Iterar sobre nuestros buses y los sinks disponibles
    local bus_num=1
    for target_sink in $usb_sinks; do
        if [ $bus_num -gt $NUM_STEREO_SINKS ]; then
            break
        fi
        
        local sink_name="${SINK_PREFIX}_bus_$((bus_num*2-1))_$((bus_num*2))"
        
        print_info "Conectando $sink_name → $(basename $target_sink)..."
        
        # Conectar L
        pw-link "${sink_name}:monitor_FL" "${target_sink}:playback_FL" 2>/dev/null && \
            print_success "  $sink_name:L → playback_FL" || \
            print_warning "  No se pudo conectar canal L"
        
        # Conectar R
        pw-link "${sink_name}:monitor_FR" "${target_sink}:playback_FR" 2>/dev/null && \
            print_success "  $sink_name:R → playback_FR" || \
            print_warning "  No se pudo conectar canal R"
        
        bus_num=$((bus_num + 1))
    done
    
    # Si hay más buses que sinks físicos, conectar los restantes al primer sink
    if [ $bus_num -le $NUM_STEREO_SINKS ]; then
        local first_sink=$(echo "$usb_sinks" | head -1)
        print_info "Buses restantes ruteados al dispositivo principal..."
        
        while [ $bus_num -le $NUM_STEREO_SINKS ]; do
            local sink_name="${SINK_PREFIX}_bus_$((bus_num*2-1))_$((bus_num*2))"
            pw-link "${sink_name}:monitor_FL" "${first_sink}:playback_FL" 2>/dev/null
            pw-link "${sink_name}:monitor_FR" "${first_sink}:playback_FR" 2>/dev/null
            print_success "  $sink_name → $(basename $first_sink)"
            bus_num=$((bus_num + 1))
        done
    fi
    
    echo ""
    print_info "Ruteo completado. Verifica con: pw-link -l"
}

# --- Instalación permanente ---

install_permanent() {
    local config_dir="${HOME}/.config/pipewire/pipewire.conf.d"
    local config_file="${config_dir}/synthigme-multichannel.conf"
    
    print_info "Instalando configuración permanente..."
    
    mkdir -p "$config_dir"
    
    cat > "$config_file" << 'EOF'
# SynthiGME-web: Configuración de sinks virtuales multicanal
# Este archivo crea sinks virtuales al iniciar PipeWire

context.objects = [
    {
        factory = adapter
        args = {
            factory.name = support.null-audio-sink
            node.name = "synthigme_bus_1_2"
            node.description = "SynthiGME Bus 1-2"
            media.class = Audio/Sink
            audio.position = [ FL FR ]
            object.linger = true
            monitor.channel-volumes = true
        }
    }
    {
        factory = adapter
        args = {
            factory.name = support.null-audio-sink
            node.name = "synthigme_bus_3_4"
            node.description = "SynthiGME Bus 3-4"
            media.class = Audio/Sink
            audio.position = [ FL FR ]
            object.linger = true
            monitor.channel-volumes = true
        }
    }
    {
        factory = adapter
        args = {
            factory.name = support.null-audio-sink
            node.name = "synthigme_bus_5_6"
            node.description = "SynthiGME Bus 5-6"
            media.class = Audio/Sink
            audio.position = [ FL FR ]
            object.linger = true
            monitor.channel-volumes = true
        }
    }
    {
        factory = adapter
        args = {
            factory.name = support.null-audio-sink
            node.name = "synthigme_bus_7_8"
            node.description = "SynthiGME Bus 7-8"
            media.class = Audio/Sink
            audio.position = [ FL FR ]
            object.linger = true
            monitor.channel-volumes = true
        }
    }
]
EOF

    print_success "Configuración guardada en: $config_file"
    print_info "Reinicia PipeWire para aplicar: systemctl --user restart pipewire"
}

uninstall_permanent() {
    local config_file="${HOME}/.config/pipewire/pipewire.conf.d/synthigme-multichannel.conf"
    
    if [ -f "$config_file" ]; then
        rm "$config_file"
        print_success "Configuración permanente eliminada"
        print_info "Reinicia PipeWire para aplicar: systemctl --user restart pipewire"
    else
        print_warning "No hay configuración permanente instalada"
    fi
}

# --- Ayuda ---

show_help() {
    print_header
    echo "Uso: $0 [opción]"
    echo ""
    echo "Opciones:"
    echo "  --install     Crear sinks virtuales (sesión actual)"
    echo "  --uninstall   Eliminar sinks virtuales (sesión actual)"
    echo "  --status      Mostrar estado de sinks y dispositivos"
    echo "  --route       Ruteo automático a dispositivo principal"
    echo "  --permanent   Instalar configuración permanente (sobrevive reinicios)"
    echo "  --remove-permanent  Eliminar configuración permanente"
    echo "  --help        Mostrar esta ayuda"
    echo ""
    echo "Sin opciones: Modo interactivo"
    echo ""
    echo "Ejemplo de uso manual después de --install:"
    echo "  1. Abre qpwgraph o Helvum"
    echo "  2. Conecta synthigme_bus_X_Y a las salidas de tu interfaz"
    echo "  3. En SynthiGME-web, selecciona el sink correspondiente"
    echo ""
}

# --- Modo interactivo ---

interactive_menu() {
    print_header
    check_pipewire
    check_tools
    echo ""
    
    echo "¿Qué deseas hacer?"
    echo ""
    echo "  1) Crear sinks virtuales (sesión actual)"
    echo "  2) Crear sinks + ruteo automático"
    echo "  3) Instalar configuración permanente"
    echo "  4) Ver estado actual"
    echo "  5) Eliminar sinks (sesión actual)"
    echo "  6) Eliminar configuración permanente"
    echo "  7) Salir"
    echo ""
    read -p "Opción [1-7]: " choice
    
    case $choice in
        1)
            create_sinks
            echo ""
            print_info "Ahora puedes usar qpwgraph para rutear los sinks a tu hardware"
            ;;
        2)
            create_sinks
            echo ""
            auto_route
            ;;
        3)
            install_permanent
            ;;
        4)
            show_status
            echo ""
            list_physical_outputs
            ;;
        5)
            remove_sinks
            ;;
        6)
            uninstall_permanent
            ;;
        7)
            echo "¡Hasta luego!"
            exit 0
            ;;
        *)
            print_error "Opción no válida"
            exit 1
            ;;
    esac
}

# --- Main ---

case "${1:-}" in
    --install)
        print_header
        check_pipewire
        check_tools
        create_sinks
        ;;
    --uninstall)
        print_header
        remove_sinks
        ;;
    --status)
        print_header
        show_status
        echo ""
        list_physical_outputs
        ;;
    --route)
        print_header
        check_pipewire
        auto_route
        ;;
    --permanent)
        print_header
        install_permanent
        ;;
    --remove-permanent)
        print_header
        uninstall_permanent
        ;;
    --help|-h)
        show_help
        ;;
    "")
        interactive_menu
        ;;
    *)
        print_error "Opción desconocida: $1"
        echo "Usa --help para ver las opciones disponibles"
        exit 1
        ;;
esac
