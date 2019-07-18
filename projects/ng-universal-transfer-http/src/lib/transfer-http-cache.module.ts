import { ModuleWithProviders, NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { BrowserTransferStateModule } from '@angular/platform-browser';
import { TransferHttpCacheConfigService } from './shared/services/transfer-http-cache-config/transfer-http-cache-config.service';
import { TransferHttpCacheInterceptor } from './shared/services/transfer-http-cache-interceptor/transfer-http-cache.interceptor';
import { TransferHttpCacheConfig } from './shared/global/interfaces';
import { NG_UNIVERSAL_TRANSFER_HTTP_CONFIG } from './shared/global/tokens';

@NgModule({
    imports: [ BrowserTransferStateModule ],
    providers: [
        TransferHttpCacheConfigService,
        { provide: HTTP_INTERCEPTORS, useClass: TransferHttpCacheInterceptor, multi: true },
    ],
})
export class TransferHttpCacheModule {
    static withConfig(config: TransferHttpCacheConfig): ModuleWithProviders {
        return {
            ngModule: TransferHttpCacheModule,
            providers: [ {
                provide: NG_UNIVERSAL_TRANSFER_HTTP_CONFIG,
                useValue: config
            } ]
        };
    }
}
