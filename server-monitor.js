const { Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Settings = new Gio.Settings({ schema: 'org.gnome.shell' });

const EXTENSION_NAME = 'cast-to-tv@rafostar.github.com';
const LOCAL_PATH = GLib.get_current_dir();

imports.searchPath.unshift(LOCAL_PATH);
const CastSettings = imports.helper.getSettings(LOCAL_PATH);
const Soup = imports.soup;
imports.searchPath.shift();

let statusTimer;
let restartCount = 0;
let persistent = true;
let loop = GLib.MainLoop.new(null, false);

class ServerMonitor
{
	constructor()
	{
		let canStart = (this._isExtensionEnabled() && !this._isServerRunning());
		if(!canStart) return;

		if(!this._checkModules() || !this._checkAddons())
		{
			CastSettings.set_boolean('service-enabled', false);
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

		let proc = Gio.Subprocess.new([nodePath, `${LOCAL_PATH}/node_scripts/server`], Gio.SubprocessFlags.NONE);
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
				CastSettings.set_boolean('service-enabled', false);
				print('Cast to TV: service stopped');
			}
		});
	}

	stopServer()
	{
		persistent = false;
		GLib.spawn_command_line_sync(`pkill -SIGINT -f ${LOCAL_PATH}/node_scripts/server`);
	}

	_isExtensionEnabled()
	{
		let allDisabled = Settings.get_boolean('disable-user-extensions');
		if(!allDisabled)
		{
			let enabledExtensions = Settings.get_strv('enabled-extensions');
			if(enabledExtensions.includes(EXTENSION_NAME))
			{
				return true;
			}
		}

		print('Cast to TV: extension is disabled');
		return false;
	}

	_isServerRunning()
	{
		if(!Soup.client)
			Soup.createClient(CastSettings.get_int('listening-port'));

		let selection = Soup.client.getSelectionSync();
		return (selection) ? true : false;
	}

	_checkModules(sourceDir)
	{
		sourceDir = sourceDir || LOCAL_PATH;

		let modulesPath = sourceDir + '/node_modules';

		let folderExists = GLib.file_test(modulesPath, GLib.FileTest.EXISTS);
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
				let moduleExists = GLib.file_test(modulesPath + '/' + module, GLib.FileTest.EXISTS);
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
		let extPath = LOCAL_PATH.substring(0, LOCAL_PATH.lastIndexOf('/'));
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

		let fileExists = GLib.file_test(packagePath, GLib.FileTest.EXISTS);
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
