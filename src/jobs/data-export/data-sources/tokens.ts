import { idb } from "@/common/db";
import { Sources } from "@/models/sources";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class TokensDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE ("t"."updated_at", "t"."contract", "t"."token_id") > ($/updatedAt/, $/contract/, $/tokenId/)`;
    }

    const query = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."description",
          "t"."collection_id",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          (
            SELECT "nb"."owner" FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
            LIMIT 1
          ) AS "owner",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          "t"."floor_sell_valid_from",
          "t"."floor_sell_valid_to",
          "t"."floor_sell_source_id",
          "t"."created_at",
          "t"."updated_at"
        FROM "tokens" "t"
        ${continuationFilter}
        ORDER BY "t"."updated_at", "t"."contract", "t"."token_id"
        LIMIT $/limit/;  
      `;

    const result = await idb.manyOrNone(query, {
      contract: cursor?.contract ? toBuffer(cursor.contract) : null,
      tokenId: cursor?.tokenId,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => ({
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        name: r.name,
        description: r.description,
        collection_id: r.collection_id,
        owner: r.owner ? fromBuffer(r.owner) : null,
        floor_ask_id: r.floor_sell_id,
        floor_ask_value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
        floor_ask_maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
        floor_ask_valid_from: r.floor_sell_valid_from ? r.floor_sell_valid_from : null,
        floor_ask_valid_to: r.floor_sell_valid_to ? r.floor_sell_valid_to : null,
        floor_ask_source: r.floor_sell_source_id
          ? sources.getByAddress(fromBuffer(r.floor_sell_source_id))?.name
          : null,
        last_sale_value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
        last_sale_timestamp: r.last_sell_timestamp,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
      }));

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          contract: fromBuffer(lastResult.contract),
          tokenId: lastResult.token_id,
          updatedAt: lastResult.updated_at,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  contract: string;
  tokenId: number;
  updatedAt: string;
};
