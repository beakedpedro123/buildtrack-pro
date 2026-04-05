/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-c5fd805d'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();

  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "beed6bffa22d0d1bd85da2fde8b3851d"
  }, {
    "url": "index.html",
    "revision": "2917d107c026c2bb1154e18273dd637c"
  }, {
    "url": "bg_reports.png",
    "revision": "f7aa4d489e58c0ed04a1b0670ba26140"
  }, {
    "url": "bg_more.png",
    "revision": "873eda9c6da373f23ff53b656cbbba38"
  }, {
    "url": "bg_jobs.png",
    "revision": "b4fe6a2d8de25da017666a9d9769ee9b"
  }, {
    "url": "bg_home.png",
    "revision": "a07c4c9b573df1a1c000dbdda2ec41b3"
  }, {
    "url": "bg_clock.png",
    "revision": "48498289e4d66410895687cd0adb7940"
  }, {
    "url": "icons/icon-512.png",
    "revision": "9fb6e13023654f7bf6d55fcfc9a40b1c"
  }, {
    "url": "icons/icon-192.png",
    "revision": "9fb6e13023654f7bf6d55fcfc9a40b1c"
  }, {
    "url": "icons/company-logo.png",
    "revision": "7d79dd5a93c1ff34e1711ae4a1e24338"
  }, {
    "url": "assets/index-DrXGow5j.js",
    "revision": null
  }, {
    "url": "assets/index-CDNj9d0t.css",
    "revision": null
  }, {
    "url": "icons/company-logo.png",
    "revision": "7d79dd5a93c1ff34e1711ae4a1e24338"
  }, {
    "url": "icons/icon-192.png",
    "revision": "9fb6e13023654f7bf6d55fcfc9a40b1c"
  }, {
    "url": "icons/icon-512.png",
    "revision": "9fb6e13023654f7bf6d55fcfc9a40b1c"
  }, {
    "url": "manifest.webmanifest",
    "revision": "177b431d9ca8fdbf36567f6d091a90a1"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/buildtrack-dnjxcthz\.manus\.space\/api\/trpc/, new workbox.NetworkFirst({
    "cacheName": "api-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 300
    })]
  }), 'GET');

}));
