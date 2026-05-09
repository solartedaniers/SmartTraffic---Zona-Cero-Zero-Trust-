#!/bin/bash
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
# Permite usar docker sin escribir 'sudo' cada vez
sudo usermod -aG docker $USER
echo "Instalación completada. Cierra y abre sesión para aplicar cambios."