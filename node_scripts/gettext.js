var fs = require('fs');
var path = require('path');
var Gettext = require('node-gettext');
var moParser = require('gettext-parser').mo;

const extLocaleDir = path.join(__dirname + '/../locale');
const translationsDir = (fs.existsSync(extLocaleDir)) ? extLocaleDir : '/usr/share/locale';
const domain = 'cast-to-tv';

var gt = new Gettext();
exports.locales = [];

exports.initTranslations = function()
{
	gt.setTextDomain(domain);

	exports.locales = fs.readdirSync(translationsDir);

	exports.locales.forEach(locale =>
	{
		var translationsFilePath = path.join(translationsDir, locale, 'LC_MESSAGES', domain + '.mo');
		fs.access(translationsFilePath, fs.constants.F_OK, (err) =>
		{
			if(err) return;

			fs.readFile(translationsFilePath, (err, data) =>
			{
				if(err) return console.log(`Cast to TV: error reading node ${locale} translation`);

				var parsedTranslations = moParser.parse(data);
				gt.addTranslations(locale, domain, parsedTranslations);
			});
		});
	});

	exports.locales.unshift('en');
}

exports.setLocale = function(locale)
{
	gt.setLocale(locale);
}

exports.translate = function(text)
{
	return gt.gettext(text);
}
