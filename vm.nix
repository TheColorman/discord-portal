{
  imports = [./nix/module.nix];

  services.discord-portal.instances.main = {
    enable = true;
    tokenFile = ./BOT_TOKEN;
  };
}
