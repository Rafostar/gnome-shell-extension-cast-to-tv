/*
Convenience replacement
Original convenience.js does not work correctly with this extension use-cases
*/

const { Gio } = imports.gi;
const Gettext = imports.gettext;

function getSettings(localPath, schemaName)
{
	if(!localPath || !schemaName) return null;

	const GioSSS = Gio.SettingsSchemaSource;
	let schemaDir = Gio.File.new_for_path(localPath).get_child('schemas');
	let schemaSource = null;

	if(schemaDir.query_exists(null))
		schemaSource = GioSSS.new_from_directory(
			localPath + '/schemas', GioSSS.get_default(), false);
	else
		schemaSource = GioSSS.get_default();

	let schemaObj = schemaSource.lookup(schemaName, true);
	if(!schemaObj)
		throw new Error('Cast to TV: extension schemas could not be found!');

	return new Gio.Settings({ settings_schema: schemaObj });
}

function initTranslations(localPath, gettextDomain)
{
	if(localPath && gettextDomain)
	{
		let localeDir = Gio.File.new_for_path(localPath).get_child('locale');

		if(localeDir.query_exists(null))
			Gettext.bindtextdomain(gettextDomain, localPath + '/locale');
		else
			Gettext.bindtextdomain(gettextDomain, '/usr/share/locale');
	}
}
