# Wine runtime for remote apps (runtime "wine"). One container per app, started on connect by
# nucbox-control and stopped when idle. The Wine prefix lives in the volume mn-wine-<slug>.
FROM debian:trixie-slim

RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      wine wine32:i386 wine64 xvfb x11vnc openbox fonts-dejavu-core fonts-liberation2 \
      ca-certificates curl locales tini \
 && sed -i 's/# de_DE.UTF-8/de_DE.UTF-8/' /etc/locale.gen && locale-gen \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1000 wine \
 && mkdir /wine && chown wine:wine /wine

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
USER wine
ENV WINEPREFIX=/wine/prefix WINEDEBUG=-all DISPLAY=:0 LANG=de_DE.UTF-8
EXPOSE 5900
ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["run"]
