<div style="margin-bottom:20px;">
<div style="line-height:60px">
    <a href="https://travis-ci.org/akanass/ng-universal-transfer-http.svg?branch=master">
        <img src="https://travis-ci.org/akanass/ng-universal-transfer-http.svg?branch=master" alt="build" />
    </a>
    <a href="https://david-dm.org/akanass/ng-universal-transfer-http">
        <img src="https://david-dm.org/akanass/ng-universal-transfer-http.svg" alt="dependencies" />
    </a>
    <a href="https://david-dm.org/akanass/ng-universal-transfer-http?type=dev">
        <img src="https://david-dm.org/akanass/ng-universal-transfer-http/dev-status.svg" alt="devDependencies" />
    </a>
</div>
<div>
    <a href="https://www.typescriptlang.org/docs/tutorial.html">
        <img src="https://cdn-images-1.medium.com/max/800/1*8lKzkDJVWuVbqumysxMRYw.png"
             align="right" alt="Typescript logo" width="50" height="50" style="border:none;" />
    </a>
    <a href="http://reactivex.io/rxjs">
        <img src="http://reactivex.io/assets/Rx_Logo_S.png"
             align="right" alt="ReactiveX logo" width="50" height="50" style="border:none;" />
    </a>
    <a href="https://www.angular.io">
            <img src="https://angular.io/assets/images/logos/angular/angular.svg"
                 align="right" alt="Angular logo" width="75" style="border:none; margin-top:-5px;" />
        </a>
</div>
</div>

# NG-Universal Transfer HTTP Cache Module

This module is an enhancement of original [`TransferHttpCacheModule`](https://github.com/angular/universal/blob/master/modules/common) from `Angular Universal` team. He allows to cache **all type of requests** and not just `GET` and/or `HEAD`.

It's written in full `RxJS` v6.5.2+

## Installation

```bash
$ yarn add @akanass/ng-universal-transfer-http

or

$ npm install --save @akanass/ng-universal-transfer-http
```

## Usage

`TransferHttpCacheModule` installs a Http interceptor that avoids duplicate `HttpClient` requests on the client, for requests that were already made when the application was rendered on the server side.

When the module is installed in the application `NgModule`, it will intercept `HttpClient` requests on the server and store the response in the `TransferState` key-value store. This is transferred to the client, which then uses it to respond to the same `HttpClient` requests on the client.

To use the `TransferHttpCacheModule` just install it as part of the top-level App module.

### src/app/app.module.ts:

```typescript
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { TransferHttpCacheModule } from '@akanass/ng-universal-transfer-http';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    // Add .withServerTransition() to support Universal rendering.
    // The application ID can be any identifier which is unique on
    // the page.
    BrowserModule.withServerTransition({ appId: 'ng-universal-example' }),
    // Add TransferHttpCacheModule to install a Http interceptor
    TransferHttpCacheModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
```

### src/app/app.server.module.ts:

```typescript
import { NgModule } from '@angular/core';
import { ServerModule, ServerTransferStateModule } from '@angular/platform-server';
import { ModuleMapLoaderModule } from '@nguniversal/module-map-ngfactory-loader';

import { AppModule } from './app.module';
import { AppComponent } from './app.component';

@NgModule({
  imports: [
    // The AppServerModule should import your AppModule followed
    // by the ServerModule from @angular/platform-server.
    AppModule,
    ServerModule,
    ModuleMapLoaderModule,
    ServerTransferStateModule
  ],
  // Since the bootstrapped component is not inherited from your
  // imported AppModule, it needs to be repeated here.
  bootstrap: [AppComponent]
})
export class AppServerModule {
}
```

### src/main.ts:

```typescript
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

document.addEventListener('DOMContentLoaded', () => {
  platformBrowserDynamic().bootstrapModule(AppModule)
    .catch(err => console.log(err));
});
```

### Polyfills:

To create the storage key, we use [`create-hash`](https://github.com/crypto-browserify/createHash) module but `Angular-CLI` v6+ disable all `node` modules in **browser** builds so we must specify all polyfills manually.

Add in `tsconfig.app.json` the path to `stream` browser version:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "outDir": "./out-tsc/app",
        "types": [],
        "paths": {
            "stream": [
                "node_modules/stream-browserify"
            ]
        }
    },
    "include": [
        "src/**/*.ts"
    ],
    "exclude": [
        "src/test.ts",
        "src/**/*.spec.ts"
    ]
}
```

Add at the end of `src/polyfills.ts` all required node modules polyfills:

```typescript
(window as any).global = window;
(window as any).process = require('process');
(window as any).Buffer = require('buffer').Buffer;
```

## Development mode compatibility

If you want to have `TransferHttpCacheModule` installed and compatible with `development` mode, you must to declare it like this:

```typescript
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { TransferHttpCacheModule } from '@akanass/ng-universal-transfer-http';
import { environment } from '../environments/environment';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    // Add .withServerTransition() to support Universal rendering.
    // The application ID can be any identifier which is unique on
    // the page.
    BrowserModule.withServerTransition({ appId: 'ng-universal-example' }),
    // Add TransferHttpCacheModule to install a Http interceptor and activate it only for production mode
    TransferHttpCacheModule.withConfig({prodMode: environment.production})
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
```

Now, when you launch your application with `ng serve` all will work fine.


## Change URL for storage's key

Sometimes, when you're in `server` side rendering, you're in **internal environment** and calls have not the same scheme (`https` for client calls and `http` for server calls) or not the same url (`public url` for client and `private url` for server) so when you come back in `browser`, request are not cached if you don't have the same url in storage's key generation.

To solve it, we add an option and you must to declare it like this:

```typescript
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { TransferHttpCacheModule } from '@akanass/ng-universal-transfer-http';
import { environment } from '../environments/environment';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    // Add .withServerTransition() to support Universal rendering.
    // The application ID can be any identifier which is unique on
    // the page.
    BrowserModule.withServerTransition({ appId: 'ng-universal-example' }),
    // Add TransferHttpCacheModule to install a Http interceptor and change in storage's key generation with value of header
    TransferHttpCacheModule.withConfig({headerNameToOverrideUrlInKeyCachingGeneration: 'x-url-header-storage-key'})
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
```

This option is compatible with `prodMode` option.

## Change History
* v1.0.0 (2019-07-12)
    * `Angular v8.1.2+`
    * Original implementation
    * Documentation

[Back to top](#installation)

## License

Copyright (c) 2019 **Nicolas Jessel** Licensed under the [MIT license](https://github.com/akanass/ng-universal-transfer-http/blob/master/LICENSE.md).

[Back to top](#installation)
