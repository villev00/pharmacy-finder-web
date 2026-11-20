# Lähi — apteekki lähelläsi

Suomenkielinen, responsiivinen apteekkihaku Euroopassa. Sovellus hakee oikeat apteekit OpenStreetMapin Overpass-rajapinnasta ja järjestää ne käyttäjän hakukeskuksesta lasketun linnuntie-etäisyyden mukaan. Käytetty palvelin sisältää Geofabrikin Eurooppa-aineiston; Euroopan ulkopuolista kattavuutta ei luvata.

**Julkaisuosoite:** https://villev00.github.io/pharmacy-finder-web/ (saatavilla onnistuneen Pages-julkaisun jälkeen)

## Käyttö

1. Valitse **Käytä sijaintiani**, syötä leveys- ja pituusaste tai paina kaupunkivalintaa.
2. Valitse 1, 5, 10, 25 tai 50 kilometrin hakuetäisyys.
3. Katso lähimmät apteekit ja avaa haluamasi apteekin kävelyreitti Google Mapsiin.

Sijaintilupaa pyydetään vain painikkeesta. Sijaintiluvan epääminen ei estä koordinaatti- tai kaupunkihakua. Kaupunkivalinnat ovat keskustojen valmiita koordinaatteja, eivät osoitehakua. Etäisyysjärjestys perustuu linnuntie-etäisyyteen, ei reitin pituuteen. Tulos tarkoittaa lähintä **OpenStreetMapista löytynyttä** apteekkia annetun hakusäteen sisällä. Aukioloaikojen raakatunniste näytetään, jos se on saatavilla; sovellus ei väitä apteekin olevan juuri nyt avoinna.

## Paikallinen käynnistys

Tarvitset Node.js 20:n tai uudemman. Ei npm-riippuvuuksia, asennusta eikä käännösvaihetta.

```sh
npm start
```

Avaa http://127.0.0.1:4173. Portin voi vaihtaa ympäristömuuttujalla `PORT`. Selaimen moduulien takia käytä paikallista HTTP-palvelinta, älä avaa HTML-tiedostoa suoraan tiedostona. Sijaintitoiminto toimii HTTPS:ssä tai selaimen luottamassa localhost-ympäristössä.

## Testit

```sh
npm test
```

Node:n sisäänrakennetut testit tarkistavat koordinaattien validoinnin, haversine-etäisyyden ja päiväntasaajan/päivämäärärajan tapaukset, hakukeskuksen pyöristyksen, node/way/relation-kohteet, etäisyysjärjestyksen, säderajauksen, duplikaatit, virheelliset ja osittaiset vastaukset, turvalliset linkit, yksityisyyden kannalta olennaisen HTTP-pyynnön, verkkovirheet, aikakatkaisun, peruutuksen sekä sijaintiluvan virheet. Testit käyttävät synteettisiä vastauksia eivätkä kuormita julkista palvelua.

Suositeltu selaintarkistus ennen julkaisua: Helsinki-haku, sijaintiluvan hyväksyntä/epääminen, virheelliset koordinaatit, meren keskelle tehty tyhjä haku, haku ilman verkkoyhteyttä, peruutus, näppäimistö ja 360 pikselin leveys. Geolokaation ja todellisen rajapinnan onnistuminen riippuvat ympäristöstä, selaimen luvista ja palvelun saatavuudesta.

## GitHub Pages

Repon **Settings → Pages → Build and deployment → Source**: valitse **GitHub Actions**. `.github/workflows/pages.yml` ajaa testit ja julkaisee `main`-haaran. Julkaisu sisältää vain viisi sovellustiedostoa; testit, paikallinen palvelin ja dokumentaatio eivät päädy sivustolle. Kaikki resurssipolut ovat suhteellisia, joten sovellus toimii myös projektin `/pharmacy-finder-web/`-polussa. Julkinen repo ja workflow eivät yksin takaa, että Pages on jo aktivoitu: tarkista onnistunut workflow-ajokerta ja julkaisuosoite.

## Toteutus

- `index.html`: semanttinen suomenkielinen käyttöliittymä ja näkyvä tietosuojakuvaus.
- `styles.css`: kermanvalkea pohja, vihreä hakupaneeli, serif-otsikot, joustava mobiiliasettelu, näkyvät näppäimistöfokukset ja vähennetyn liikkeen tuki.
- `app.js`: DOM-käyttöliittymä, peruutus ja vanhentuneiden vastausten suojaus. Ulkoista tekstiä lisätään vain `textContent`/tekstisolmuilla, ei HTML:nä.
- `lib.js`: puhdas validointi ja etäisyyslaskenta, OSM-normalisointi sekä peruutettava HTTP-haku.
- `test/lib.test.js`: logiikka- ja pyyntösopimustestit ilman ulkoisia riippuvuuksia.

Overpass-kysely hakee `amenity=pharmacy`-kohteet kaikista kolmesta OSM-kohdetyypistä. Rakennusten ja relaatioiden sijaintina käytetään Overpassin palauttamaa keskipistettä, joten sisäänkäynti voi olla hieman eri paikassa. Tarkka hakusäde rajataan lopuksi selaimessa. Enintään 100 lähintä tulosta näytetään. Palveluvirhettä tai Overpassin `remark`-virhevastausta ei käsitellä tyhjänä onnistuneena hakuna. Haku tehdään kerran käyttäjän käskystä; ei taustapollausta, automaattisia uusintayrityksiä tai varapalvelimiin siirtämistä.

## Tietosuoja ja ulkoiset palvelut

Ei analytiikkaa, evästeitä, paikallistallennusta, API-avaimia, ulkoisia fontteja tai kolmannen osapuolen JavaScriptiä. Sijaintia ei haeta sivun latauksen yhteydessä eikä seurata jatkuvasti. Tarkka lähtösijainti on vain välilehden muistissa; se poistuu suljettaessa tai ladattaessa sivu uudelleen.

Käyttäjän aloittama haku lähettää **ovp.dresel.systems**-palvelulle Saksaan kolmeen desimaaliin pyöristetyn hakukeskuksen, säteen ja apteekkikyselyn. Palvelu näkee IP-osoitteen ja normaalit HTTP-yhteystiedot. Sen tietosuojaselosteen mukaan kyselytekstiä ja yhteystietoja säilytetään 14 päivää. IPv4-yhteydet kulkevat erillisen saksalaisen välityspalvelimen kautta; sen lokien säilytyksestä palveluntarjoaja ei anna varmaa tietoa. Kolme desimaalia vastaa enintään noin sataa metriä leveysasteessa; tarkkuus pituusasteessa riippuu leveysasteesta. Hakuun lisätään 200 metrin marginaali, jotta pyöristys ei kadota varsinaisen säteen reunalla olevia kohteita, ja etäisyys rajataan sitten tarkasti paikallisesti.

Google Mapsin reittilinkki sisältää vain apteekin koordinaatit, ei sovelluksen lähtösijaintia. Google voi pyytää oman sijaintilupansa. Myös apteekkien sivut, OpenStreetMap ja julkaisualusta käsittelevät normaalit yhteystiedot omien käytäntöjensä mukaan. Sovelluksen tietosuojateksti kertoo nämä tiedot ennen sijaintipainikkeen käyttöä ja avattavassa lisäkuvauksessa.

## Data, kapasiteetti ja lähteet

Karttatiedot: **© OpenStreetMap contributors**, [ODbL](https://www.openstreetmap.org/copyright). Tiedot voivat olla puutteellisia tai vanhentuneita: tarkista apteekin palvelut ja aukiolo apteekista. [Dreselin avoin palvelu](https://ovp.dresel.systems/) päivittää Euroopan Geofabrik-aineistoa yleensä seuraavana päivänä ja sallii enintään neljä samanaikaista pyyntöä IP-osoitetta kohden. Sovellus tekee vain yhden pyynnön kerrallaan. Palvelulla ei ole saatavuustakuuta; se voi rajoittaa tai hylätä pyyntöjä. Sovellus on kevyt esittelyprojekti. Laajempaan käyttöön tarvitaan hallittu välimuisti/taustapalvelu tai oma Overpass-palvelin. Endpoint on koottu yhteen `lib.js`-vakioon; toista palvelinta käytettäessä päivitä samalla CSP, aluekuvaus ja tietosuojateksti.

- [Overpass QL:n virallinen yhteisödokumentaatio](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [Overpass-palvelun käyttöehdot ja aluekattavuus](https://ovp.dresel.systems/)
- [Overpass-palvelun tietosuoja](https://ovp.dresel.systems/impressum.html)
- [GitHub Pages -julkaisutyönkulut](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Koordinaattihaku ei tarvitse geokoodauspalvelua. Sovellus ei käytä Nominatimia.

## Lisenssi

Sovelluksen lähdekoodi: MIT. OpenStreetMap-data säilyttää oman ODbL-lisenssinsä.
