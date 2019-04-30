const { GLib } = imports.gi;
const ByteArray = imports.byteArray;

function checkServerRunning()
{
	let [res, out_fd] = GLib.spawn_command_line_sync('pgrep -a node');
	let outStr;

	if(out_fd instanceof Uint8Array) outStr = ByteArray.toString(out_fd);
	else outStr = out_fd.toString();

	if(res && outStr.includes('cast-to-tv@rafostar.github.com')) return true;
	else return false;
}

function startServer(localPath)
{
	/* Check if npm modules are installed */
	let modulesInstalled = checkModules(localPath);
	if(!modulesInstalled) return;

	GLib.spawn_async('/usr/bin', ['node', localPath + '/node_scripts/server'], null, 0, null);
}

function closeServer(localPath)
{
	GLib.spawn_command_line_sync(`pkill -SIGINT -f ${localPath}`);
}

function checkModules(localPath)
{
	let modulesPath = localPath  + '/node_modules';

	let folderExists = GLib.file_test(modulesPath, 16);
	if(!folderExists) return false;

	let dependencies = readDependencies(localPath);
	if(dependencies)
	{
		for(var module in dependencies)
		{
			let moduleExists = GLib.file_test(modulesPath + '/' + module, 16);
			if(!moduleExists) return false;
		}

		return true;
	}

	return false;
}

function readDependencies(localPath)
{
	let packagePath = localPath  + '/package.json';

	let fileExists = GLib.file_test(packagePath, 16);
	if(fileExists)
	{
		let [readOk, readFile] = GLib.file_get_contents(packagePath);

		if(readOk)
		{
			let data;

			if(readFile instanceof Uint8Array)
			{
				try{ data = JSON.parse(ByteArray.toString(readFile)); }
				catch(e){ data = null; }
			}
			else
			{
				try{ data = JSON.parse(readFile); }
				catch(e){ data = null; }
			}

			if(data) return data.dependencies;
		}
	}

	return null;
}
