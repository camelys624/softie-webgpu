# Maintainer: softie project
pkgname=softie-desktop
pkgver=1.0.0
pkgrel=1
pkgdesc='A native WebGPU soft-body toy desktop application'
arch=('x86_64')
url='https://softie.520ai.site'
license=('MIT')
depends=('electron')
makedepends=('npm')

build() {
  cd "$startdir"
  [[ -d dist ]] || { echo 'dist/ is missing; run npm install and npm run build first.' >&2; return 1; }
}

package() {
  local appdir="$pkgdir/usr/lib/softie-desktop"
  cd "$startdir"

  install -dm755 "$appdir/dist" "$appdir/electron"
  cp -a dist/. "$appdir/dist/"
  install -Dm644 electron/main.cjs "$appdir/electron/main.cjs"
  install -Dm755 electron/softie-launcher.sh "$pkgdir/usr/bin/softie"
  install -Dm644 electron/softie.desktop "$pkgdir/usr/share/applications/softie.desktop"
  install -Dm644 public/favicon.svg "$pkgdir/usr/share/icons/hicolor/scalable/apps/softie.svg"
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
