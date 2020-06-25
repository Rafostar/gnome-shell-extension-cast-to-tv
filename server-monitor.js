const { Gio, GLib } = imports.gi;
const Settings = new Gio.Settings({ schema: 'org.gnome.shell' });

const EXTENSION_NAME = 'cast-to-tv@rafostar.github.com';
const LOCAL_PATH = GLib.get_current_dir();
const NODE_PATH = (GLib.find_program_in_path('nodejs') || GLib.find_program_in_path('node'));

imports.searchPath.unshift(LOCAL_PATH);
const Helper = imports.helper;
const Soup = imports.soup;
imports.searchPath.shift();

const CastSettings = Helper.getSettings(LOCAL_PATH);

let statusTimer;
let restartCount = 0;
let persistent = true;
let loop = GLib.MainLoop.new(null, false);

class ServerMonitor
{
	constructor()
	{
		let canStart = (this._isExtensionEnabled() && !this._getIsServerRunning());

		if(!NODE_PATH)
			Helper.notify('Cast to TV', 'nodejs' + ' ' + "is not installed!");

		if(
			!canStart
			|| !NODE_PATH
			|| !this._checkModules()
			|| !this._checkAddons()
		) {
			/* If there was an error do not try to start on each login */
			if(CastSettings.get_boolean('service-wanted'))
				CastSettings.set_boolean('service-wanted', false);

			return;
		}

		Settings.connect('changed::disable-user-extensions', () => this._onSettingsChanged());
		Settings.connect('changed::enabled-extensions', () => this._onSettingsChanged());

		this.startServer();
		loop.run();
	}

	startServer()
	{
		let proc = Gio.Subprocess.new(
			[NODE_PATH, `${LOCAL_PATH}/node_scripts/server`],
			Gio.SubprocessFlags.NONE
		);
		log('Cast to TV: service started');

		proc.wait_async(null, () =>
		{
			loop.quit();

			if(persistent)
			{
				log('Cast to TV: restarting server');

				let modulesInstalled = this._checkModules();
				let addonsInstalled = this._checkAddons();

				if(modulesInstalled && addonsInstalled)
				{
					this.startServer();

					restartCount++;
					if(restartCount >= 3)
					{
						log('Cast to TV: server crashed too many times!');
						return this.stopServer();
					}

					if(!statusTimer)
						this._startTimer();

					return loop.run();
				}
			}

			log('Cast to TV: service stopped');
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
				return true;
		}

		log('Cast to TV: extension is disabled');

		return false;
	}

	_getIsServerRunning()
	{
		if(!Soup.client)
			Soup.createClient(CastSettings.get_int('listening-port'));

		let data = Soup.client.getIsServiceEnabledSync();

		return (data && data.isEnabled);
	}

	_checkModules(sourceDir)
	{
		sourceDir = sourceDir || LOCAL_PATH;

		let modulesPath = `${sourceDir}/node_modules`;

		let folderExists = GLib.file_test(modulesPath, GLib.FileTest.EXISTS);
		if(!folderExists)
		{
			Helper.notify('Cast to TV', 'Required npm modules are not installed!');
			return false;
		}

		/* Read cast-to-tv package.json */
		let pkgInfo = this._getPkgInfo(sourceDir);

		if(!pkgInfo || !pkgInfo.dependencies)
		{
			log('Cast to TV: could not read package.json!');
			return false;
		}

		let dependencies = pkgInfo.dependencies;

		for(let module in dependencies)
		{
			let modulePath = `${modulesPath}/${module}`;
			let moduleExists = GLib.file_test(modulePath, GLib.FileTest.EXISTS);

			if(!moduleExists)
			{
				Helper.notify('Cast to TV', `Missing npm module: ${module}`);
				return false;
			}

			let isRequiredVer = this._checkPkgVersion(modulePath, dependencies[module]);

			if(!isRequiredVer)
			{
				Helper.notify('Cast to TV', 'Installed npm modules are outdated!');
				return false;
			}
		}

		return true;
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
				addons.push(`${extPath}/${dirName}`);
		}

		for(let addonDir of addons)
		{
			let addonModulesInstalled = this._checkModules(addonDir);

			if(!addonModulesInstalled)
				return false;
		}

		return true;
	}

	_checkPkgVersion(modulePath, version)
	{
		let isExactVer = false;
		let pkgInfo = this._getPkgInfo(modulePath);

		if(!pkgInfo || !pkgInfo.version)
			return false;

		if(isNaN(version.charAt(0)))
			version = version.substring(1);
		else
			isExactVer = true;

		return (isExactVer)
			? pkgInfo.version == version
			: pkgInfo.version >= version
	}

	_getPkgInfo(modulePath)
	{
		let data = Helper.readFromFile(`${modulePath}/package.json`);
		return (data) ? data : null;
	}

	_onSettingsChanged()
	{
		let enabled = this._isExtensionEnabled();

		if(!enabled)
			this.stopServer();
	}

	_startTimer()
	{
		statusTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () =>
		{
			statusTimer = null;
			restartCount = 0;

			return GLib.SOURCE_REMOVE;
		});
	}
}

let monitor = new ServerMonitor();
