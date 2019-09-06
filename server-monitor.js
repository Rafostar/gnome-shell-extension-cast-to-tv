const { Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const extensionName = 'cast-to-tv@rafostar.github.com';
const localPath = `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/${extensionName}`;
const Settings = new Gio.Settings({ schema: 'org.gnome.shell' });
const castSettings = getSettings();

let statusTimer;
let restartCount = 0;
let persistent = true;
let loop = GLib.MainLoop.new(null, false);

function getSettings()
{
	const GioSSS = Gio.SettingsSchemaSource;
	let schemaSource = GioSSS.new_from_directory(
		localPath + '/schemas', GioSSS.get_default(), false);
	let schemaObj = schemaSource.lookup('org.gnome.shell.extensions.cast-to-tv', true);

	return new Gio.Settings({ settings_schema: schemaObj });
}

class ServerMonitor
{
	constructor()
	{
		let canStart = (this._isExtensionEnabled() && !this._isServerRunning());
		if(!canStart) return;

		if(!this._checkModules() || !this._checkAddons())
		{
			castSettings.set_boolean('service-enabled', false);
			return;
		}

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
		print('Cast to TV: service started');

		proc.wait_async(null, () =>
		{
			loop.quit();

			if(persistent)
			{
				print('Cast to TV: restarting server');

				let modulesInstalled = this._checkModules();
				let addonsInstalled = this._checkAddons();

				if(modulesInstalled && addonsInstalled)
				{
					this.startServer();

					restartCount++;
					if(restartCount >= 3)
					{
						print('Cast to TV: server crashed too many times!');
						this.stopServer();
						return;
					}

					if(!statusTimer) this._startTimer();

					loop.run();
				}
			}
			else
			{
				castSettings.set_boolean('service-enabled', false);
				print('Cast to TV: service stopped');
			}
		});
	}

	stopServer()
	{
		persistent = false;
		GLib.spawn_command_line_sync(`pkill -SIGINT -f ${localPath}/node_scripts/server`);
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

		print('Cast to TV: extension is disabled');
		return false;
	}

	_isServerRunning()
	{
		let [res, out_fd] = GLib.spawn_command_line_sync('pgrep -a node');
		let outStr;

		if(out_fd instanceof Uint8Array) outStr = ByteArray.toString(out_fd);
		else outStr = out_fd.toString();

		if(res && outStr.includes(extensionName) && outStr.includes('server')) return true;
		else return false;
	}

	_checkModules(sourceDir)
	{
		sourceDir = sourceDir || localPath;

		let modulesPath = sourceDir + '/node_modules';

		let folderExists = GLib.file_test(modulesPath, 16);
		if(!folderExists)
		{
			print('Cast to TV: npm modules not installed!');
			return false;
		}

		let dependencies = this._getDependencies(sourceDir);
		if(dependencies)
		{
			for(let module in dependencies)
			{
				let moduleExists = GLib.file_test(modulesPath + '/' + module, 16);
				if(!moduleExists)
				{
					print(`Cast to TV: missing npm module: ${module}`);
					return false;
				}
			}

			return true;
		}

		return false;
	}

	_checkAddons()
	{
		let extPath = localPath.substring(0, localPath.lastIndexOf('/'));
		let extDir = Gio.File.new_for_path(extPath);
		let dirEnum = extDir.enumerate_children('standard::name,standard::type', 0, null);
		let addons = [];

		let info;
		while((info = dirEnum.next_file(null)))
		{
			let dirName = info.get_name();

			if(dirName.includes('cast-to-tv') && dirName.includes('addon'))
			{
				addons.push(extPath + '/' + dirName);
			}
		}

		for(let addonDir of addons)
		{
			let addonModulesInstalled = this._checkModules(addonDir);
			if(!addonModulesInstalled) return false;
		}

		return true;
	}

	_getDependencies(readPath)
	{
		let packagePath = readPath + '/package.json';

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

		print('Cast to TV: could not read npm dependencies!');
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
