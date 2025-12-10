{
  buildNpmPackage,
  makeWrapper,
  lib,
  nodejs_20,
  node-gyp,
  apng2gif,
}:
buildNpmPackage {
  pname = "discord-portal";
  version = "0.4.0";

  nodejs = nodejs_20;

  src = ./..;

  npmDepsHash = "sha256-PMuNXMx40JYOHovFIBU3JPqocg+LBQPWDnnRXL+o/80=";

  nativeBuildInputs = [makeWrapper node-gyp];

  postInstall = ''
    wrapProgram $out/bin/discord-portal \
    	--suffix PATH : ${lib.makeBinPath [apng2gif]}
  '';

  meta = {
    description = "Discord bot that creates Portals across servers";
    homepage = "https://github.com/TheColorman/discord-portal";
    license = lib.licenses.gpl3;
    mainProgram = "discord-portal";
    maintainers = with lib.maintainers; [TheColorman];
  };
}
