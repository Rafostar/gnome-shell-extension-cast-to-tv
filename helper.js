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
	let schemaSource = GioSSS.new_from_directory(
		localPath + '/schemas', GioSSS.get_default(), false);
	let schemaObj = schemaSource.lookup(schemaName, true);

	return new Gio.Settings({ settings_schema: schemaObj });
}

function initTranslations(localPath, gettextDomain)
{
	if(localPath && gettextDomain)
		Gettext.bindtextdomain(gettextDomain, localPath + '/locale');
}
