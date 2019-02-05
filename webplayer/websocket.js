var websocket = io();

player.on('ended', () => { websocket.emit('track-ended'); });
websocket.on('reload', () => { location.reload(true); });
