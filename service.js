const { GLib } = imports.gi;
const ByteArray = imports.byteArray;

function checkServerRunning()
{
	let [res, out_fd] = GLib.spawn_command_line_sync('pgrep -a node');
	let outStr;

	if(out_fd instanceof Uint8Array) outStr = ByteArray.toString(out_fd);
	else outStr = out_fd.toString();

	if(res && outStr.includes('cast-to-tv')) return true;
	else return false;
}

function startServer(localPath)
{
	GLib.spawn_async('/usr/bin', ['node', localPath + '/node_scripts/server'], null, 0, null);
}

function closeServer(localPath)
{
	GLib.spawn_command_line_sync(`pkill -SIGINT -f ${localPath}`);
}
