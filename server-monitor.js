const { Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Settings = new Gio.Settings({ schema: 'org.gnome.shell' });
const extensionName = 'cast-to-tv@rafostar.github.com';
const localPath = `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/${extensionName}`;

let statusTimer;
let restartCount = 0;
let persistent = true;
let loop = GLib.MainLoop.new(null, false);

class ServerMonitor
{
	constructor()
	{
		let canStart = (
			this._isExtensionEnabled()
			&& !this._isServerRunning()
			&& this._checkModules()
		);

		if(!canStart) return;

		Settings.connect('changed::disable-user-extensions', () => this._onSettingsChanged());
		Settings.connect('changed::enabled-extensions', () => this._onSettingsChanged());

		this.startServer();
		loop.run();
	}

	startServer()
	{
		let nodePath = (GLib.find_program_in_path('nodejs') || GLib.find_program_in_path('node'));

		if(!nodePath)
		{
			print('Cast to TV: nodejs executable not found!');
			loop.quit();
			return;
		}

		let proc = Gio.Subprocess.new([nodePath, localPath + '/node_scripts/server'], Gio.SubprocessFlags.NONE);
		print('Started Cast to TV service');

		proc.wait_async(null, () =>
		{
			loop.quit();

			if(persistent)
			{
				print('Restarting Cast to TV server');

				let modulesInstalled = this._checkModules();
				if(modulesInstalled)
				{
					this.startServer();

					restartCount++;
					if(restartCount >= 3)
					{
						print('Cast to TV server crashed too many times! Service stopped.');
						this.stopServer();
						return;
					}

					if(!statusTimer) this._startTimer();

					loop.run();
				}
			}
		});
	}

	stopServer()
	{
		persistent = false;
		GLib.spawn_command_line_sync(`pkill -SIGINT -f ${localPath}/node_scripts/server`);
		print('Stopped Cast to TV service');
	}

	_isExtensionEnabled()
	{
		let allDisabled = Settings.get_boolean('disable-user-extensions');
		if(!allDisabled)
		{
			let enabledExtensions = Settings.get_strv('enabled-extensions');
			if(enabledExtensions.includes(extensionName))
			{
				return true;
			}
		}

		print('Cast to TV extension is disabled');
		return false;
	}

	_isServerRunning()
	{
		let [res, out_fd] = GLib.spawn_command_line_sync('pgrep -a node');
		let outStr;

		if(out_fd instanceof Uint8Array) outStr = ByteArray.toString(out_fd);
		else outStr = out_fd.toString();

		if(res && outStr.includes(extensionName) && outStr.includes('server'))
		{
			print('Cast to TV server is already running!');
			return true;
		}
		else return false;
	}

	_checkModules()
	{
		let modulesPath = localPath  + '/node_modules';

		let folderExists = GLib.file_test(modulesPath, 16);
		if(!folderExists)
		{
			print('Cast to TV node modules not installed');
			return false;
		}

		let dependencies = this._readDependencies(localPath);
		if(dependencies)
		{
			for(var module in dependencies)
			{
				let moduleExists = GLib.file_test(modulesPath + '/' + module, 16);
				if(!moduleExists)
				{
					print(`Missing Cast to TV node module: ${module}`);
					return false;
				}
			}

			return true;
		}

		return false;
	}

	_readDependencies()
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

				if(data)
				{
					return data.dependencies;
				}
			}
		}

		print('Cast to TV could not read node dependencies!');
		return null;
	}

	_onSettingsChanged()
	{
		let enabled = this._isExtensionEnabled();
		if(!enabled) this.stopServer();
	}

	_startTimer()
	{
		statusTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () =>
		{
			restartCount = 0;
			statusTimer = null;
		});
	}
}

let monitor = new ServerMonitor();
