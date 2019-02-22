var fs = require('fs');
var path = require('path');
var Gettext = require('node-gettext');
var moParser = require('gettext-parser').mo;

const translationsDir = path.join(__dirname + '/../locale');
const domain = 'cast-to-tv';

var gt = new Gettext();
exports.locales = [];

exports.initTranslations = function()
{
	gt.setTextDomain(domain);

	exports.locales = fs.readdirSync(translationsDir);

	exports.locales.forEach((locale) => {
		var fileName = domain + '.mo';
		var translationsFilePath = path.join(translationsDir, locale, 'LC_MESSAGES', fileName);
		var translationsContent = fs.readFileSync(translationsFilePath);

		var parsedTranslations = moParser.parse(translationsContent);
		gt.addTranslations(locale, domain, parsedTranslations);
	});
}

exports.setLocale = function(locale)
{
	gt.setLocale(locale);
}

exports.translate = function(text)
{
	return gt.gettext(text);
}
