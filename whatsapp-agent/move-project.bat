@echo off
echo 🚀 Moviendo WhatsApp Sales Agent fuera de OneDrive...
echo.

REM Crear directorio en C:\
if not exist "C:\dev" mkdir "C:\dev"

echo 📁 Copiando proyecto a C:\dev\whatsapp-sales-agent...
xcopy "%~dp0" "C:\dev\whatsapp-sales-agent\" /E /I /H /Y

echo ✅ Proyecto copiado exitosamente!
echo.
echo 📋 INSTRUCCIONES:
echo 1. Abre una nueva terminal en: C:\dev\whatsapp-sales-agent
echo 2. Ejecuta: npm run dev
echo 3. El proyecto funcionará sin problemas de OneDrive
echo.
echo 🗑️  Puedes eliminar la carpeta original de OneDrive después de verificar que funciona
echo.
pause
