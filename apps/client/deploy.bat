@echo off
setlocal

REM Build the Electron client in Docker, ship the unpacked app to a remote host
REM over SSH, then restart it via supervisor.
REM
REM Host-specific settings (target host, user, paths) live in a git-ignored
REM .env.deploy - copy .env.deploy.example to .env.deploy and fill it in.

cd /d "%~dp0"

REM --- Load host-specific config (git-ignored). eol=# skips comment lines. ---
if exist ".env.deploy" (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env.deploy") do set "%%a=%%b"
)

if not defined REMOTE_USER set "REMOTE_USER=root"
if not defined SUPERVISOR_SERVICE_NAME set "SUPERVISOR_SERVICE_NAME=waktu-client"
if not defined REMOTE_HOST (
    echo Error: REMOTE_HOST not set. Copy .env.deploy.example to .env.deploy and set your target host.
    exit /b 1
)
if not defined REMOTE_APP_DIR (
    echo Error: REMOTE_APP_DIR not set in .env.deploy.
    exit /b 1
)

REM VITE_API_BASE is baked into the client at build time. The build runs inside
REM the container, so it is passed through to "docker run" below (the .env file is
REM not visible in the image).
if not defined VITE_API_BASE (
    echo Warning: VITE_API_BASE not set in .env.deploy; defaulting to http://localhost:3000
    set "VITE_API_BASE=http://localhost:3000"
)

REM --- Build Step ---
REM Context is the monorepo root (..\..) so the pnpm workspace + lockfile are in
REM scope; the Dockerfile lives here in apps\client.
echo Building the Electron application using Docker...
docker build -t waktu-client-builder -f Dockerfile ..\..
if %ERRORLEVEL% neq 0 (
    echo Docker build failed!
    exit /b 1
)
docker run --rm -e VITE_API_BASE=%VITE_API_BASE% -v "%cd%\release:/repo/apps/client/release" waktu-client-builder
if %ERRORLEVEL% neq 0 (
    echo Docker run failed!
    exit /b 1
)

REM --- Deployment Step ---
echo Deploying to %REMOTE_HOST%...

REM Get version from package.json
for /f "delims=" %%i in ('node -p "require('./package.json').version"') do set "VERSION=%%i"
echo Using version %VERSION% from package.json

REM The build output for an unpacked Linux app from electron-builder is in
REM 'release\<version>\linux-arm64-unpacked'.
set "BUILD_DIR=release\%VERSION%\linux-arm64-unpacked"

if not exist "%BUILD_DIR%" (
    echo Error: Build directory '%BUILD_DIR%' not found.
    echo Please check your electron-builder configuration and build output.
    exit /b 1
)

REM Change to the build directory
pushd "%BUILD_DIR%"

REM Create the remote directory, then pipe the tar archive to unpack it on the remote host.
echo Transferring application files...
REM This command requires 'tar.exe' and 'ssh.exe' to be in your system's PATH.
REM (e.g., from Git for Windows installation)
tar -cf - . | ssh "%REMOTE_USER%@%REMOTE_HOST%" "mkdir -p %REMOTE_APP_DIR% && tar -C %REMOTE_APP_DIR% -xvf -"
if %ERRORLEVEL% neq 0 (
    echo File transfer failed!
    popd
    exit /b 1
)

REM Need to chmod the main executable on the remote host to ensure it has execute permissions.
echo Setting execute permissions on the remote host...
ssh "%REMOTE_USER%@%REMOTE_HOST%" "chmod +x %REMOTE_APP_DIR%/waktu-react"

REM Return to the original directory
popd

REM --- Restart Step ---
echo Restarting the application via supervisorctl...
ssh "%REMOTE_USER%@%REMOTE_HOST%" "supervisorctl restart %SUPERVISOR_SERVICE_NAME%"
if %ERRORLEVEL% neq 0 (
    echo Supervisor restart failed!
    exit /b 1
)

echo Deployment finished successfully!
endlocal
