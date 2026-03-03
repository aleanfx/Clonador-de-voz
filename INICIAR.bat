@echo off
TITLE Qwen3-TTS Launcher
color 0b

echo.
echo ===================================================
echo    Iniciando Plataforma de Clonacion Qwen3-TTS
echo ===================================================
echo.

:: Verificar que Python exista
where python >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python no esta instalado o no esta en las variables de entorno PATH.
    echo Por favor, instala Python 3.10 o superior marcando "Add Python to PATH".
    pause
    exit /b
)

echo [1/2] Iniciando servidor web local para el Frontend (puerto 5500)...
echo       Esto sirve la pagina web correctamente para evitar errores de seguridad.
echo.
start "Qwen3-TTS Frontend Server" cmd /k "cd /d "%~dp0frontend" && python -m http.server 5500"

echo [2/2] Esperando 2 segundos y abriendo la interfaz...
timeout /t 2 /nobreak >nul

start "" "http://localhost:5500"

echo.
echo ===================================================
echo    FRONTEND LISTO: http://localhost:5500
echo.
echo    Ahora pega el enlace de Google Colab (ngrok)
echo    en el cajoncito "URL del Backend" de la pagina.
echo ===================================================
echo.
echo Para detener el sistema, cierra esta ventana y la del servidor.
echo.
pause
