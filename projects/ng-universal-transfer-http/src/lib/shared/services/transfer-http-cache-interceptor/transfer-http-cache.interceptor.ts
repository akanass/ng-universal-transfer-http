import { isPlatformServer } from '@angular/common';
import {
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpHeaders,
    HttpInterceptor,
    HttpRequest,
    HttpResponse
} from '@angular/common/http';
import { ApplicationRef, Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { makeStateKey, StateKey, TransferState } from '@angular/platform-browser';

import createHash from 'create-hash';
import { stringify } from 'flatted/esm';

import { from, merge, Observable, of, throwError } from 'rxjs';
import { defaultIfEmpty, filter, first, flatMap, map, tap, toArray } from 'rxjs/operators';

import { TransferHttpCacheConfigService } from '../transfer-http-cache-config/transfer-http-cache-config.service';

/**
 * Response interface
 */
interface TransferHttpResponse {
    body?: any | null;
    error?: any | null;
    headers?: { [ k: string ]: string[] };
    status?: number;
    statusText?: string;
    url?: string;
}

/**
 * Server state interface
 */
interface ServerStateData {
    id: number;
    reqKey: string;
}

@Injectable()
export class TransferHttpCacheInterceptor implements HttpInterceptor {
    // private property to store cache activation status
    private _isCacheActivated: boolean;
    // private property to store unique id of the key
    private _id: number;
    // private property to store serve state data store key
    private readonly _serverStateDataStoreKey: StateKey<ServerStateData[]>;
    // private property to store last id store key
    private readonly _lastIdStoreKey: StateKey<number>;
    // private property to store flag to know if cache is activated in server
    private readonly _isCacheActivatedStoreKey: StateKey<boolean>;

    /**
     * Class constructor
     */
    constructor(private _appRef: ApplicationRef, private _transferState: TransferState,
                @Inject(PLATFORM_ID) private _platformId: any,
                private _configService: TransferHttpCacheConfigService) {
        this._id = 0;
        this._serverStateDataStoreKey = makeStateKey<ServerStateData[]>('server_state_data');
        this._lastIdStoreKey = makeStateKey<number>('server_state_last_id');
        this._isCacheActivatedStoreKey = makeStateKey<boolean>('is_cache_activated');

        this._initCacheProcess();
    }

    /**
     * Initialize cache process
     */
    private _initCacheProcess(): void {
        // initialize cache flag for the current platform
        of(of(isPlatformServer(this._platformId)))
            .pipe(
                flatMap((isServer: Observable<boolean>) =>
                    merge(
                        isServer
                            .pipe(
                                filter(_ => !!_),
                                tap(_ => this._isCacheActivated = _),
                                tap(_ => this._transferState.set(this._isCacheActivatedStoreKey, _))
                            ),
                        isServer
                            .pipe(
                                filter(_ => !_),
                                tap(_ =>
                                    this._transferState.hasKey(this._isCacheActivatedStoreKey) ?
                                        this._isCacheActivated = this._transferState.get<boolean>(this._isCacheActivatedStoreKey, true) :
                                        this._isCacheActivated = _
                                )
                            )
                    )
                ),
                flatMap(() =>
                    // Stop using the cache if the application has stabilized, indicating initial rendering is complete
                    // or if we are in development mode.
                    merge(
                        of(this._configService.config.prodMode)
                            .pipe(
                                filter(_ => !_),
                                tap(() =>
                                    console.log('TransferHttpCacheModule is in the development mode. ' +
                                        'Enable the production mode with Server Side Rendering.')
                                )
                            ),
                        this._appRef.isStable
                            .pipe(
                                filter(_ => !!_)
                            )
                    )
                        .pipe(
                            first()
                        )
                )
            ).subscribe(() => this._isCacheActivated = false);
    }

    /**
     * Interceptor process
     */
    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return of(
            of(this._isCacheActivated)
        )
            .pipe(
                flatMap((isCacheActivated: Observable<boolean>) =>
                    merge(
                        isCacheActivated
                            .pipe(
                                filter(_ => !_),
                                flatMap(() => next.handle(req)
                                    .pipe(
                                        tap(() => this._cleanServerState())
                                    )
                                )
                            ),
                        isCacheActivated
                            .pipe(
                                filter(_ => !!_),
                                flatMap(() => this._transferStateProcess(req, next))
                            )
                    )
                )
            );
    }

    /**
     * Function to clean all data in server state
     */
    private _cleanServerState(): void {
        merge(
            this._getLastId(false)
                .pipe(
                    tap(() => this._transferState.remove(this._lastIdStoreKey))
                ),
            this._getServerStateData(false)
                .pipe(
                    tap(_ =>
                        _.forEach(__ =>
                            this._transferState.remove(makeStateKey<TransferHttpResponse>(this._createHash(`${__.reqKey}_${__.id}`)))
                        )
                    ),
                    tap(() => this._transferState.remove(this._serverStateDataStoreKey))
                ),
            of(of(this._transferState.hasKey(this._isCacheActivatedStoreKey)))
                .pipe(
                    flatMap((hasKey: Observable<boolean>) =>
                        hasKey
                            .pipe(
                                filter(_ => !!_),
                                tap(() => this._transferState.remove(this._isCacheActivatedStoreKey))
                            )
                    )
                )
        )
            .subscribe(
                () => undefined,
                e => {
                    throw(e);
                }
            );
    }

    /**
     * Transfer state process
     */
    private _transferStateProcess(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return this._createKey(req)
            .pipe(
                flatMap(storeKey =>
                    of(of(this._transferState.hasKey(storeKey)))
                        .pipe(
                            flatMap(hasKey =>
                                merge(
                                    this._hasKeyProcess(hasKey, storeKey),
                                    this._hasNotKeyProcess(req, next, hasKey, storeKey)
                                )
                            )
                        )
                ),
            );
    }

    /**
     * Creates transfer state key's store
     */
    private _createKey(req: HttpRequest<any>): Observable<StateKey<TransferHttpResponse>> {
        this._id++;

        return of(of(isPlatformServer(this._platformId)))
            .pipe(
                flatMap((isServer: Observable<boolean>) =>
                    merge(
                        isServer
                            .pipe(
                                filter(_ => !!_),
                                flatMap(() => this._serverKey(req))
                            ),
                        isServer
                            .pipe(
                                filter(_ => !_),
                                flatMap(() => this._clientKey(req))
                            )
                    )
                )
            );
    }

    /**
     * Function to get state data and create client key for current request
     */
    private _clientKey(req: HttpRequest<any>): Observable<StateKey<TransferHttpResponse>> {
        return this._requestFormatted(req)
            .pipe(
                map((_: HttpRequest<any>) => this._createHash(stringify(_))),
                flatMap(reqKey =>
                    this._getServerStateData()
                        .pipe(
                            flatMap(_ => from(_)),
                            filter(_ => _.reqKey === reqKey),
                            defaultIfEmpty(undefined),
                            flatMap(_ =>
                                !!_ ?
                                    of(_) :
                                    throwError(new Error('Request missing in server state data'))
                            ),
                            flatMap(serverState =>
                                this._getLastId()
                                    .pipe(
                                        flatMap(_ =>
                                            !_ || this._id > _ ?
                                                throwError(new Error('Wrong id for server state data')) :
                                                of(this._id)
                                        ),
                                        map(_ => _ === serverState.id ? _ : serverState.id),
                                        map(id => this._createHash(`${reqKey}_${id}`)),
                                        map(key => makeStateKey<TransferHttpResponse>(key))
                                    )
                            )
                        )
                )
            );
    }

    /**
     * Function to get last id from server
     */
    private _getLastId(_throwError: boolean = true): Observable<number> {
        return of(this._lastIdStoreKey)
            .pipe(
                flatMap(storeKey =>
                    of(of(this._transferState.hasKey(storeKey)))
                        .pipe(
                            flatMap(hasKey =>
                                merge(
                                    hasKey
                                        .pipe(
                                            filter(_ => !_),
                                            flatMap(() =>
                                                of(_throwError)
                                                    .pipe(
                                                        filter(__ => !!__),
                                                        flatMap(() => throwError(new Error('Missing server state last id')))
                                                    )
                                            )
                                        ),
                                    hasKey
                                        .pipe(
                                            filter(_ => !!_),
                                            map(() => this._transferState.get(storeKey, 0))
                                        )
                                )
                            )
                        )
                )
            );
    }

    /**
     * Function to get server state data
     */
    private _getServerStateData(_throwError: boolean = true): Observable<ServerStateData[]> {
        return of(this._serverStateDataStoreKey)
            .pipe(
                flatMap(storeKey =>
                    of(of(this._transferState.hasKey(storeKey)))
                        .pipe(
                            flatMap(hasKey =>
                                merge(
                                    hasKey
                                        .pipe(
                                            filter(_ => !_),
                                            flatMap(() =>
                                                of(_throwError)
                                                    .pipe(
                                                        filter(__ => !!__),
                                                        flatMap(() => throwError(new Error('Missing server state data')))
                                                    )
                                            )
                                        ),
                                    hasKey
                                        .pipe(
                                            filter(_ => !!_),
                                            map(() => this._transferState.get(storeKey, [] as ServerStateData[]))
                                        )
                                )
                            )
                        )
                )
            );
    }

    /**
     * Function to create server key and store state data for current request
     */
    private _serverKey(req: HttpRequest<any>): Observable<StateKey<TransferHttpResponse>> {
        return this._requestFormatted(req)
            .pipe(
                map((_: HttpRequest<any>) => this._createHash(stringify(_))),
                tap(reqKey => this._storeServerStateData(reqKey)),
                map(reqKey => this._createHash(`${reqKey}_${this._id}`)),
                map(key => makeStateKey<TransferHttpResponse>(key))
            );
    }

    /**
     * Function to store server state data
     */
    private _storeServerStateData(reqKey: string): void {
        of(this._serverStateDataStoreKey)
            .pipe(
                flatMap(storeKey =>
                    of(of(this._transferState.hasKey(storeKey)))
                        .pipe(
                            flatMap(hasKey =>
                                merge(
                                    hasKey
                                        .pipe(
                                            filter(_ => !_),
                                            map(() => [] as ServerStateData[])
                                        ),
                                    hasKey
                                        .pipe(
                                            filter(_ => !!_),
                                            map(() => this._transferState.get(storeKey, [] as ServerStateData[])),
                                            flatMap(serverStateData =>
                                                !!serverStateData.find(_ => _.reqKey === reqKey) ?
                                                    throwError(new Error('Request already stored in server state data')) :
                                                    of(serverStateData)
                                            )
                                        )
                                )
                            ),
                            tap(() => this._transferState.set(this._lastIdStoreKey, this._id))
                        )
                )
            )
            .subscribe(
                serverStateData => this._transferState.set(this._serverStateDataStoreKey, serverStateData.concat({
                        id: this._id,
                        reqKey
                    })
                ),
                e => {
                    throw(e);
                }
            );
    }

    /**
     * Process when key exists in transfer state
     */
    private _hasKeyProcess(hasKey: Observable<boolean>, storeKey: StateKey<TransferHttpResponse>): Observable<HttpEvent<any>> {
        return hasKey
            .pipe(
                filter(_ => !!_),
                map(() => of(this._transferState.get(storeKey, {} as TransferHttpResponse))),
                flatMap((obs: Observable<TransferHttpResponse>) =>
                    merge(
                        obs
                            .pipe(
                                filter(_ => _.status < 400),
                                map((response: TransferHttpResponse) => new HttpResponse<any>({
                                    body: response.body,
                                    headers: new HttpHeaders(response.headers),
                                    status: response.status,
                                    statusText: response.statusText,
                                    url: response.url,
                                }))
                            ),
                        obs
                            .pipe(
                                filter(_ => _.status >= 400),
                                flatMap((response: TransferHttpResponse) =>
                                    throwError(new HttpErrorResponse({
                                        error: response.error,
                                        headers: new HttpHeaders(response.headers),
                                        status: response.status,
                                        statusText: response.statusText,
                                        url: response.url,
                                    }))
                                )
                            )
                    )
                )
            );
    }

    /**
     * Process when key doesn't exist in transfer state
     */
    private _hasNotKeyProcess(req: HttpRequest<any>,
                              next: HttpHandler,
                              hasKey: Observable<boolean>,
                              storeKey: StateKey<TransferHttpResponse>): Observable<HttpEvent<any>> {
        return hasKey
            .pipe(
                filter(_ => !_),
                flatMap(() =>
                    next.handle(req)
                        .pipe(
                            tap((event: HttpEvent<any>) =>
                                    of(event)
                                        .pipe(
                                            filter(evt => evt instanceof HttpResponse)
                                        )
                                        .subscribe((evt: HttpResponse<any>) => this._transferState.set(storeKey, {
                                            body: evt.body,
                                            headers: this._getHeadersMap(evt.headers),
                                            status: evt.status,
                                            statusText: evt.statusText,
                                            // tslint:disable-next-line:no-non-null-assertion
                                            url: evt.url!,
                                        })),
                                (error: any) =>
                                    of(error)
                                        .pipe(
                                            filter(err => err instanceof HttpErrorResponse)
                                        )
                                        .subscribe((err: HttpErrorResponse) => this._transferState.set(storeKey, {
                                            error: err.error,
                                            headers: this._getHeadersMap(err.headers),
                                            status: err.status,
                                            statusText: err.statusText,
                                            // tslint:disable-next-line:no-non-null-assertion
                                            url: err.url!,
                                        }))
                            )
                        )
                )
            );
    }

    /**
     * Creates Headers Map
     */
    private _getHeadersMap(headers: HttpHeaders): { [ name: string ]: string[] } {
        // tslint:disable-next-line:no-non-null-assertion
        return headers.keys().reduce((acc, curr) => Object.assign(acc, { [ curr ]: headers.getAll(curr)! }), {});
    }

    /**
     * Function to create sha256 hash
     */
    private _createHash(data: any): string {
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Returns HttpRequest with value of header inside url & urlWithParams
     */
    private _replaceWithHeader(req: HttpRequest<any>, headerName: string): Observable<HttpRequest<any>> {
        return of(of(this._getHeadersMap(req.headers)[ headerName ]))
            .pipe(
                flatMap((obs: Observable<string[]>) =>
                    merge(
                        obs.pipe(
                            filter((_: string[]) => !!_ && !!_.length),
                            map((_: string[]) => of(_[ _.length - 1 ])),
                            flatMap((o: Observable<string>) =>
                                merge(
                                    o.pipe(
                                        filter(_ => !!_),
                                        flatMap((headerValue: string) =>
                                            merge(
                                                this._formatUrlWithHeaderValue(req.url, headerValue),
                                                this._formatUrlWithHeaderValue(req.urlWithParams, headerValue),
                                            ).pipe(
                                                toArray(),
                                                map(_ => Object.assign({}, req, {
                                                    url: _[ 0 ],
                                                    urlWithParams: _[ 1 ]
                                                }) as HttpRequest<any>)
                                            )
                                        )
                                    ),
                                    o.pipe(
                                        filter(_ => !_),
                                        flatMap(() =>
                                            throwError(
                                                new Error(`Missing header '${headerName}' value inside request to generate state key`)
                                            )
                                        )
                                    )
                                )
                            )
                        ),
                        obs.pipe(
                            filter(_ => !_ || !_.length),
                            flatMap(() =>
                                throwError(new Error(`Missing header '${headerName}' value inside request to generate state key`))
                            )
                        )
                    )
                )
            );
    }

    /**
     * Replace url with header value
     */
    private _formatUrlWithHeaderValue(url: string, headerValue: string): Observable<string> {
        return of(url)
            .pipe(
                map((_: string) => _.split('://')[ 1 ].split('/')),
                map((_: string[]) => _.map((s, i) => i === 0 ? headerValue : s)),
                map((_: string[]) => _.join('/'))
            );
    }

    /**
     * Returns the good request object to create hash
     */
    private _requestFormatted(req: HttpRequest<any>): Observable<HttpRequest<any>> {
        return of(of(this._configService.config.headerNameToOverrideUrlInKeyCachingGeneration))
            .pipe(
                flatMap((obs: Observable<string>) =>
                    merge(
                        obs.pipe(
                            filter(_ => !!_),
                            flatMap(_ => this._replaceWithHeader(req, _))
                        ),
                        obs.pipe(
                            filter(_ => !_),
                            map(() => req)
                        )
                    )
                )
            );
    }
}
