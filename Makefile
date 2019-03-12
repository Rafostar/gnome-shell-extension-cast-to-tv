# Basic Makefile

UUID = cast-to-tv@rafostar.github.com
TOLOCALIZE = widget.js file-chooser.js prefs.js node_scripts/messages.js
MSGSRC = $(wildcard ./po/*.po)
POTFILE = ./po/cast-to-tv.pot
ZIPFILES = *.js metadata.json package.json package-lock.json node_scripts webplayer schemas locale appIcon LICENSE README.md
INSTALLPATH = ~/.local/share/gnome-shell/extensions

# Compile schemas #
glib-schemas:
	glib-compile-schemas ./schemas/

# Create/update potfile #
potfile:
	mkdir -p po
	xgettext -o $(POTFILE) --language=JavaScript --add-comments=TRANSLATORS: --package-name "Cast to TV" $(TOLOCALIZE)

# Update '.po' from 'potfile' #
mergepo:
	for i in $(MSGSRC); do \
		msgmerge -U $$i $(POTFILE); \
	done;

# Compile .mo files #
compilemo:
	mkdir -p locale
	for i in $(MSGSRC); do \
		mkdir -p ./locale/`basename $$i .po`; \
		mkdir -p ./locale/`basename $$i .po`/LC_MESSAGES; \
		msgfmt -c -o ./locale/`basename $$i .po`/LC_MESSAGES/cast-to-tv.mo $$i; \
	done;

# Create release zip #
zip-file: _build
	zip -qr $(UUID).zip $(ZIPFILES)

# Build and install #
install: zip-file
	mkdir -p $(INSTALLPATH)
	mkdir -p $(INSTALLPATH)/$(UUID)
	unzip -qo $(UUID).zip -d $(INSTALLPATH)/$(UUID)

_build: glib-schemas potfile mergepo compilemo

