# Measurements and their meanings

The authoritative [measurement definitions](measurements.json) enumerate **10 observations/classifications**. This page explains the human meaning of each one, how Stratlas relates it to an actual feature, and what it must not be mistaken for.

## Measurement inventory

| Measurement | Concept ID | Source | Geography | Value and units | Period |
| --- | --- | --- | --- | --- | --- |
| Zoning designation | `zoning_designation` | `la-zoning` | `zoning_feature` | `categorical`; code | provider_updated |
| Zoning category | `zoning_category` | `la-zoning` | `zoning_feature` | `categorical`; category | provider_updated |
| Median household income | `median_household_income` | `acs2024` | `census_tract` | `estimate`; nominal_USD_per_household | 2020-2024 |
| Income margin of error | `median_household_income_moe` | `acs2024` | `census_tract` | `margin_of_error`; nominal_USD | 2020-2024 |
| Population | `tract_population` | `acs2024` | `census_tract` | `estimate`; persons_per_tract | 2020-2024 |
| Female share | `female_share` | `acs2024` | `census_tract` | `derived_ratio`; percent_of_tract_population | 2020-2024 |
| Hispanic or Latino share | `hispanic_share` | `acs2024` | `census_tract` | `derived_ratio`; percent_of_tract_population | 2020-2024 |
| Non-Hispanic White alone share | `nonhispanic_white_alone_share` | `acs2024` | `census_tract` | `derived_ratio`; percent_of_tract_population | 2020-2024 |
| Assessed land value | `assessed_land_value` | `lacounty-assessor-parcels` | `cadastral_parcel` | `assessment`; nominal_USD | Per Roll_Year |
| Assessed improvement value | `assessed_improvement_value` | `lacounty-assessor-parcels` | `cadastral_parcel` | `assessment`; nominal_USD | Per Roll_Year |

## Detailed definitions

### Zoning designation

`zoning_designation` · source `la-zoning` · feature `zoning_feature`.

**Meaning:** The original zone designation supplied by LA City Planning.

**Measurement:** `categorical`, units `code`. Time semantics: `provider_updated`. Source field: `Zoning`. 

### Zoning category

`zoning_category` · source `la-zoning` · feature `zoning_feature`.

**Meaning:** Provider-supplied planning category; not land use of each dwelling.

**Measurement:** `categorical`, units `category`. Time semantics: `provider_updated`. Source field: `CATEGORY`. 

### Median household income

`median_household_income` · source `acs2024` · feature `census_tract`.

**Meaning:** ACS median household income estimate, not net wealth.

**Measurement:** `estimate`, units `nominal_USD_per_household`. Survey period: 2020-2024. ACS table: `B19013`. Estimate field: `B19013001`. Rendered field: `acs_income`.

### Income margin of error

`median_household_income_moe` · source `acs2024` · feature `census_tract`.

**Meaning:** ACS 90% margin of error for median household income.

**Measurement:** `margin_of_error`, units `nominal_USD`. Survey period: 2020-2024. ACS table: `B19013`. Error field: `B19013001`. Rendered field: `acs_income_moe`.

**Uncertainty:** 90% confidence margin of error; not an exact census count.

### Population

`tract_population` · source `acs2024` · feature `census_tract`.

**Meaning:** Tract persons, not population density.

**Measurement:** `estimate`, units `persons_per_tract`. Survey period: 2020-2024. ACS table: `B01001`. Estimate field: `B01001001`. Rendered field: `acs_population`.

### Female share

`female_share` · source `acs2024` · feature `census_tract`.

**Meaning:** ACS reported female estimate divided by population, multiplied by 100.

**Measurement:** `derived_ratio`, units `percent_of_tract_population`. Survey period: 2020-2024. ACS table: `B01001`. Rendered field: `acs_female_pct`.

**Formula:** Derived value: `B01001026` ÷ `B01001001` × 100. This is a share of a published tract-level denominator, not an attribute of an individual.

### Hispanic or Latino share

`hispanic_share` · source `acs2024` · feature `census_tract`.

**Meaning:** Hispanic/Latino of any race relative to total population.

**Measurement:** `derived_ratio`, units `percent_of_tract_population`. Survey period: 2020-2024. ACS table: `B03002`. Rendered field: `acs_hispanic_pct`.

**Formula:** Derived value: `B03002012` ÷ `B03002001` × 100. This is a share of a published tract-level denominator, not an attribute of an individual.

### Non-Hispanic White alone share

`nonhispanic_white_alone_share` · source `acs2024` · feature `census_tract`.

**Meaning:** Non-Hispanic White alone divided by total population.

**Measurement:** `derived_ratio`, units `percent_of_tract_population`. Survey period: 2020-2024. ACS table: `B03002`. Rendered field: `acs_nh_white_pct`.

**Formula:** Derived value: `B03002003` ÷ `B03002001` × 100. This is a share of a published tract-level denominator, not an attribute of an individual.

### Assessed land value

`assessed_land_value` · source `lacounty-assessor-parcels` · feature `cadastral_parcel`.

**Meaning:** Tax-roll land component; neither market price nor sale price.

**Measurement:** `assessment`, units `nominal_USD`. Date: read `Roll_Year` from each individual feature. Source field: `Roll_LandValue`. 

### Assessed improvement value

`assessed_improvement_value` · source `lacounty-assessor-parcels` · feature `cadastral_parcel`.

**Meaning:** Tax-roll improvement component; neither house sale price nor household wealth.

**Measurement:** `assessment`, units `nominal_USD`. Date: read `Roll_Year` from each individual feature. Source field: `Roll_ImpValue`. 

## Interpretation safeguards

- Missing, suppressed and invalid estimates are unknown/null, not zero.
- Dollar-valued assessments are not market valuations; ACS household income is not wealth.
- A tract proportion is aggregate and does not identify any individual person.
- A categorical zoning class is not a measure of assessed or market property value.

There is no source-backed market transaction layer or household net-worth layer in the current Los Angeles pilot. These measurements belong to the listed sources, not to a synthetic or universal metropolitan dataset. See [source provenance](SOURCES.md), [the data source catalog](../sources/catalog.json), and the [LA specimen](../metropolises/los-angeles.md).
