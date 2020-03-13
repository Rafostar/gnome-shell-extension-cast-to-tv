# Basic Makefile

EXTNAME = gnome-shell-extension-cast-to-tv
UUID = cast-to-tv@rafostar.github.com
GETTEXT = cast-to-tv
PACKAGE = "Cast to TV"
TOLOCALIZE = extension.js widget.js playlist.js file-chooser.js prefs.js node_scripts/messages.js
MSGSRC = $(wildcard ./po/cast-to-tv/*.po)
POTFILE = ./po/cast-to-tv/cast-to-tv.pot
ZIPFILES = *.js *.json node_scripts webplayer schemas locale appIcon nautilus COPYING README.md
INSTALLPATH = ~/.local/share/gnome-shell/extensions

# Add-ons translations #
POFOLDERS = $(wildcard ./po/cast-to-tv-*-addon)

# Compile schemas #
glib-schemas:
	glib-compile-schemas ./schemas/

# Create/update potfile #
potfile:
	mkdir -p ./po
	xgettext -o $(POTFILE) --language=JavaScript --add-comments=TRANSLATORS: --package-name $(PACKAGE) $(TOLOCALIZE)

# Update '.po' from 'potfile' #
mergepo:
	for i in $(MSGSRC); do \
		msgmerge -U $$i $(POTFILE); \
	done;

# Compile all .mo files #
compilemo: compilemo-base compilemo-addons

# Compile extension .mo files #
compilemo-base:
	for i in $(MSGSRC); do \
		mkdir -p ./locale/`basename $$i .po`/LC_MESSAGES; \
		msgfmt -o ./locale/`basename $$i .po`/LC_MESSAGES/$(GETTEXT).mo $$i; \
	done;

# Compile addons .mo files #
compilemo-addons:
	for i in $(POFOLDERS); do \
		for j in $$i/*.po; do \
			mkdir -p ./locale_addons/`basename $$i`/`basename $$j .po`/LC_MESSAGES; \
			msgfmt -o ./locale_addons/`basename $$i`/`basename $$j .po`/LC_MESSAGES/`basename $$i`.mo $$j; \
		done; \
	done;

# Create release zip #
zip-file: _build
	zip -qr $(UUID).zip $(ZIPFILES)

# Update metadata #
metadata:
ifeq ($(CUSTOMPATH),)
ifeq ($(PKGDIR),)
	LASTCOMMIT=$(shell git rev-parse --short HEAD); \
	grep -q '"git":' metadata.json \
	&& sed -i "/\"git\":/c \ \ \"git\": \"$$LASTCOMMIT\"," metadata.json \
	|| sed -i "/uuid/a \ \ \"git\": \"$$LASTCOMMIT\"," metadata.json
else
	grep -q '"custom-install":' metadata.json \
	|| sed -i "/uuid/a \ \ \"custom-install\": true," metadata.json
endif
endif

# Build and install #
install: compilemo-base metadata
ifeq ($(CUSTOMPATH),)
	glib-compile-schemas ./schemas/
	mkdir -p $(INSTALLPATH)/$(UUID)
	cp -r $(ZIPFILES) $(INSTALLPATH)/$(UUID)
else
	mkdir -p $(CUSTOMPATH)/$(UUID)
	cp -r $(filter-out schemas locale README.md COPYING, $(ZIPFILES)) $(CUSTOMPATH)/$(UUID)
	mkdir -p $(PKGDIR)/usr/share/glib-2.0/schemas
	cp -r ./schemas/*.gschema.* $(PKGDIR)/usr/share/glib-2.0/schemas/
	glib-compile-schemas $(PKGDIR)/usr/share/glib-2.0/schemas 2>/dev/null
	mkdir -p $(PKGDIR)/usr/share/locale
	cp -r ./locale/* $(PKGDIR)/usr/share/locale/
	mkdir -p $(PKGDIR)/usr/share/doc/$(EXTNAME)
	cp ./README.md $(PKGDIR)/usr/share/doc/$(EXTNAME)/
	mkdir -p $(PKGDIR)/usr/share/licenses/$(EXTNAME)
	cp ./COPYING $(PKGDIR)/usr/share/licenses/$(EXTNAME)/
	mkdir -p $(CUSTOMPATH)/$(UUID)/node_modules
	chmod 777 $(CUSTOMPATH)/$(UUID)/node_modules
endif

_build: glib-schemas compilemo-base

