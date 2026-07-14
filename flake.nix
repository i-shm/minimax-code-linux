{
  description = "Unofficial, user-scoped Nix package for MiniMax Agent";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
      minimax-agent = pkgs.callPackage ./nix/minimax-agent.nix { };
    in
    {
      packages.${system} = {
        inherit minimax-agent;
        default = minimax-agent;
      };

      apps.${system}.default = {
        type = "app";
        program = "${minimax-agent}/bin/minimax-agent";
        meta.description = "Launch MiniMax Agent";
      };

      checks.${system}.launcher-policy = pkgs.callPackage ./nix/launcher-policy-check.nix {
        inherit minimax-agent;
      };
    };
}
