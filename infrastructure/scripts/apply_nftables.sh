#!/bin/bash
# Script para aplicar reglas nftables Zero Trust
# Uso: bash apply_nftables.sh <nombre-vm>
# Ejemplo: bash apply_nftables.sh vm-data
#
# VMs disponibles: vm-auth, vm-data, vm-ingest, vm-core, vm-app

VM=$1

if [ -z "$VM" ]; then
    echo "Error: debes indicar el nombre de la VM"
    echo "Uso: bash apply_nftables.sh <vm-auth|vm-data|vm-ingest|vm-core|vm-app>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NFT_FILE="$SCRIPT_DIR/../networking/${VM}.nft"

if [ ! -f "$NFT_FILE" ]; then
    echo "Error: no se encontró el archivo $NFT_FILE"
    exit 1
fi

echo "=== Aplicando reglas nftables para $VM ==="

# Copiar archivo de reglas
sudo cp "$NFT_FILE" /etc/nftables.conf

# Aplicar reglas
sudo nft -f /etc/nftables.conf

# Verificar que cargaron
echo "Reglas aplicadas:"
sudo nft list ruleset

# Habilitar servicio para que persistan al reiniciar
sudo systemctl enable nftables
sudo systemctl restart nftables

echo "=== Firewall $VM configurado ==="