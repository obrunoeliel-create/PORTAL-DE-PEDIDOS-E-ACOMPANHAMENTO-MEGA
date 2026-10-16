-- Mesa Premiada pausada até a autorização da SPA/MF (Lei 5.768/1971, art. 1º; Portaria SEAE/ME 7.638/2022, arts. 2º e 34):
-- sem divulgação no cardápio e sem sorteio. Para retomar, uma nova migração reativa a campanha.
UPDATE "CampanhaNatal" SET "active" = false, "updatedAt" = NOW() WHERE "id" = 1;
