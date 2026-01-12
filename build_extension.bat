@echo off
echo Building service-worker.js...

set DEST="c:\Users\itsad\Desktop\PlexDubai\Extension\extension\background\service-worker.js"
set CONFIG="c:\Users\itsad\Desktop\PlexDubai\Extension\extension\utils\config.js"
set SOCKET="c:\Users\itsad\Desktop\PlexDubai\Extension\desktop-app\node_modules\socket.io-client\dist\socket.io.min.js"
set LOGIC="c:\Users\itsad\Desktop\PlexDubai\Extension\extension\background\logic.js"
set NL="c:\Users\itsad\Desktop\PlexDubai\Extension\newline.txt"

echo // Service Worker Bundle > %DEST%

echo Append Config...
type %CONFIG% >> %DEST%
type %NL% >> %DEST%

echo Append Socket.IO...
type %SOCKET% >> %DEST%
type %NL% >> %DEST%

echo Append Logic...
type %LOGIC% >> %DEST%
type %NL% >> %DEST%

echo Build Complete.
pause
