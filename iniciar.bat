@echo off
setlocal EnableExtensions
title TeleVault - Telegram Uploader
color 0a
cd /d "%~dp0"

echo ========================================================
echo   TeleVault - Telegram Uploader
echo ========================================================

set "PY=%~dp0.venv\Scripts\python.exe"

:: 1) Entorno virtual. Se comprueba que FUNCIONA de verdad: si apunta a un Python que ya
::    no existe (se desinstalo, se movio o se actualizo) se borra y se vuelve a crear.
::    (Se usan etiquetas y no bloques con parentesis: dentro de un bloque, las variables
::    se sustituyen antes de ejecutarlo y quedarian vacias.)
if not exist "%PY%" goto :make_venv
"%PY%" -c "import sys" >nul 2>&1
if errorlevel 1 goto :make_venv
goto :venv_ready

:make_venv
if exist ".venv" echo El entorno virtual esta danado o apunta a un Python que ya no existe. Se recreara...
if exist ".venv" rmdir /s /q ".venv"
call :find_python
if not defined BASE_PY goto :no_python
echo Creando entorno virtual con: %BASE_PY%
%BASE_PY% -m venv .venv
"%PY%" -c "import sys" >nul 2>&1
if errorlevel 1 goto :venv_failed
goto :venv_ready

:no_python
echo [ERROR] No se ha encontrado un Python 3.10 o superior que funcione.
echo         Instala Python desde https://www.python.org/downloads/ y vuelve a abrir este archivo.
pause
exit /b 1

:venv_failed
echo [ERROR] No se pudo crear un entorno virtual que funcione.
echo         Prueba a reinstalar Python y vuelve a abrir este archivo.
pause
exit /b 1

:venv_ready
"%PY%" --version
echo.

:: 2) Dependencias: con requirements.lock se instalan EXACTAMENTE esas versiones;
::    la primera vez se instala requirements.txt y se genera el lock.
::    Si ya estan instaladas, pip no descarga nada y tarda un par de segundos.
if exist requirements.lock goto :install_lock
"%PY%" -m pip install -r requirements.txt --disable-pip-version-check -q
if errorlevel 1 goto :deps_failed
"%PY%" -m pip freeze > requirements.lock
goto :deps_done

:install_lock
"%PY%" -m pip install -r requirements.lock --disable-pip-version-check -q
if errorlevel 1 goto :deps_failed
goto :deps_done

:deps_failed
echo [ERROR] No se pudieron instalar las dependencias. Comprueba tu conexion a Internet.
pause
exit /b 1

:deps_done

:: 3) cryptg (opcional): acelera el cifrado. Si falla, se recuerda para no reintentarlo cada vez
if exist ".venv\cryptg_failed" goto :start_server
"%PY%" -c "import cryptg" >nul 2>&1
if not errorlevel 1 goto :start_server
echo Instalando cryptg (acelera el cifrado)...
"%PY%" -m pip install -r requirements-optional.txt --disable-pip-version-check -q
if not errorlevel 1 goto :start_server
echo [AVISO] cryptg no esta disponible para esta version de Python. Se continua sin el.
echo fallo> ".venv\cryptg_failed"

:: 4) Arranque (un solo servidor: interfaz + API, solo accesible desde este equipo)
:start_server
echo.
echo Abre en tu navegador:  http://127.0.0.1:3000
echo Cierra esta ventana o pulsa Ctrl+C para detener.
echo.
"%PY%" backend\main.py

pause
exit /b 0

:: ---------------------------------------------------------------------------
:: Busca un Python que funcione de verdad (no basta con que el comando exista)
:: ---------------------------------------------------------------------------
:find_python
set "BASE_PY="
call :try_python "py -3"
call :try_python "python"
call :try_python "python3"
exit /b 0

:try_python
if defined BASE_PY exit /b 0
%~1 -c "import sys; sys.exit(0 if sys.version_info[:2] >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 set "BASE_PY=%~1"
exit /b 0