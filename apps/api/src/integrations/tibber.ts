const DEFAULT_TIBBER_ENDPOINT = "https://api.tibber.com/v1-beta/gql";

export type TibberFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TibberPriceLevel =
  | "VERY_CHEAP"
  | "CHEAP"
  | "NORMAL"
  | "EXPENSIVE"
  | "VERY_EXPENSIVE"
  | null;

export type TibberPrice = Readonly<{
  total: number | null;
  energy: number | null;
  tax: number | null;
  startsAt: string | null;
  currency: string;
  level: TibberPriceLevel;
}>;

export type TibberHome = Readonly<{
  id: string;
  appNickname?: string | null;
  timeZone?: string;
  type?: string;
  size?: number | null;
  numberOfResidents?: number | null;
  mainFuseSize?: number | null;
  primaryHeatingSource?: string | null;
  features?: Readonly<{
    realTimeConsumptionEnabled?: boolean | null;
  }> | null;
  meteringPointData?: Readonly<{
    gridCompany?: string | null;
    gridAreaCode?: string | null;
    priceAreaCode?: string | null;
    estimatedAnnualConsumption?: number | null;
  }> | null;
  currentSubscription?: Readonly<{
    id: string;
    status?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
  }> | null;
}>;

export type TibberPriceResponse = Readonly<{
  id: string;
  currentSubscription: Readonly<{
    id: string;
    status?: string | null;
    priceInfo: Readonly<{
      current: TibberPrice | null;
      today: readonly TibberPrice[];
      tomorrow: readonly TibberPrice[];
    }> | null;
  }> | null;
}>;

export type TibberConsumptionResponse = Readonly<{
  id: string;
  consumption: Readonly<{
    nodes:
      | readonly Readonly<{
          from: string;
          to: string;
          consumption: number | null;
          consumptionUnit: string | null;
          unitPrice: number | null;
          unitPriceVAT: number | null;
          cost: number | null;
          currency: string | null;
        }>[]
      | null;
    pageInfo: Readonly<{
      count: number | null;
      totalConsumption: number | null;
      totalCost: number | null;
      currency: string | null;
    }>;
  }> | null;
}>;

export interface TibberGateway {
  homes(): Promise<readonly TibberHome[]>;
  prices(homeId: string): Promise<TibberPriceResponse>;
  consumption(homeId: string, days: number): Promise<TibberConsumptionResponse>;
}

type GraphQlEnvelope<T> = Readonly<{
  data?: T;
  errors?: readonly Readonly<{ message?: string }>[];
}>;

export class TibberApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TibberApiError";
  }
}

export type TibberClientOptions = Readonly<{
  token: string;
  endpoint?: string;
  fetch?: TibberFetch;
}>;

export class TibberClient implements TibberGateway {
  private readonly endpoint: string;
  private readonly fetchImpl: TibberFetch;
  private readonly token: string;

  constructor(options: TibberClientOptions) {
    const token = options.token.trim();
    if (token.length === 0) {
      throw new TibberApiError("Tibber token is empty");
    }

    this.token = token;
    this.endpoint = options.endpoint ?? DEFAULT_TIBBER_ENDPOINT;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async query<T>(
    query: string,
    variables: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "li-erikes-apparat/0.1",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new TibberApiError(
        `Tibber request failed with HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as GraphQlEnvelope<T>;
    if (payload.errors !== undefined && payload.errors.length > 0) {
      const message = payload.errors
        .map((error) => error.message ?? "Unknown GraphQL error")
        .join("; ");
      throw new TibberApiError(`Tibber GraphQL error: ${message}`);
    }
    if (payload.data === undefined) {
      throw new TibberApiError("Tibber response did not contain data");
    }

    return payload.data;
  }

  async homes(): Promise<readonly TibberHome[]> {
    const data = await this.query<{
      viewer: { homes: readonly TibberHome[] };
    }>(`
      query Homes {
        viewer {
          homes {
            id
            appNickname
            timeZone
            type
            size
            numberOfResidents
            mainFuseSize
            primaryHeatingSource
            features {
              realTimeConsumptionEnabled
            }
            meteringPointData {
              gridCompany
              gridAreaCode
              priceAreaCode
              estimatedAnnualConsumption
            }
            currentSubscription {
              id
              status
              validFrom
              validTo
            }
          }
        }
      }
    `);

    return data.viewer.homes;
  }

  async prices(homeId: string): Promise<TibberPriceResponse> {
    const data = await this.query<{
      viewer: { home: TibberPriceResponse };
    }>(
      `
        query Prices($homeId: ID!) {
          viewer {
            home(id: $homeId) {
              id
              currentSubscription {
                id
                status
                priceInfo(resolution: QUARTER_HOURLY) {
                  current {
                    total
                    energy
                    tax
                    startsAt
                    currency
                    level
                  }
                  today {
                    total
                    energy
                    tax
                    startsAt
                    currency
                    level
                  }
                  tomorrow {
                    total
                    energy
                    tax
                    startsAt
                    currency
                    level
                  }
                }
              }
            }
          }
        }
      `,
      { homeId },
    );

    return data.viewer.home;
  }

  async consumption(
    homeId: string,
    days: number,
  ): Promise<TibberConsumptionResponse> {
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      throw new RangeError("Tibber daily consumption supports 1 to 31 days");
    }

    const data = await this.query<{
      viewer: { home: TibberConsumptionResponse };
    }>(
      `
        query Consumption($homeId: ID!, $days: Int!) {
          viewer {
            home(id: $homeId) {
              id
              consumption(
                resolution: DAILY
                last: $days
                filterEmptyNodes: true
              ) {
                nodes {
                  from
                  to
                  consumption
                  consumptionUnit
                  unitPrice
                  unitPriceVAT
                  cost
                  currency
                }
                pageInfo {
                  count
                  totalConsumption
                  totalCost
                  currency
                }
              }
            }
          }
        }
      `,
      { homeId, days },
    );

    return data.viewer.home;
  }
}
