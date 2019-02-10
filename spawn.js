const Util = imports.misc.util;
const Local = imports.misc.extensionUtils.getCurrentExtension();

function fileChooser(streamType)
{
	/* To not freeze gnome shell FileChooserDialog needs to be run as separate process */
	Util.spawn(['gjs', Local.path + '/file-chooser.js', Local.path, streamType]);
}

function extensionPrefs()
{
	Util.spawn(['gnome-shell-extension-prefs', 'cast-to-tv@rafostar.github.com']);
}

function closeServer()
{
	Util.spawn(['pkill', '-SIGINT', '-f', Local.path]);
}
