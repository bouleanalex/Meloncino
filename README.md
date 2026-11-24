# Meloncino

Applicazione web locale per stimare turni e retribuzione Metalmeccanico Industria D2, Randstad / Alfa Laval. Archivio multianno **2026–2100**, senza dipendenze esterne, registrazione o invio dei dati online.

## Avvio e salvataggio

1. Aprire `index.html` con Chrome o Edge, anche con doppio clic. Nella cartella devono restare `styles.css`, `app.js`, `payroll.js`, `calendar.js`, `calibration.js` e `seed.js`.
2. All’apertura viene selezionato il **mese corrente**, usando la data locale del dispositivo, anche se l’ultima visita era su un altro mese. Se l’anno corrente è già nell’archivio viene selezionato anch’esso; altrimenti resta l’anno salvato, senza crearne uno automaticamente. Durante l’uso si possono selezionare liberamente anno e mese, modificare turni e ore.
3. Usare **Regole e parametri del calcolo** per tariffe, gettoni, quantità del mese, tredicesima, premio di produzione e riconciliazione.
4. Esportare periodicamente un backup JSON. Contiene **tutti gli anni**, inclusi turnazioni di riferimento e netti reali.

Il salvataggio usa `localStorage`. Cambiare browser/profilo, spostare la cartella o cancellare i dati del sito può far perdere l’archivio; su URL `file:` il comportamento dipende dal browser. Se il salvataggio fallisce l’app lo segnala e resta utilizzabile in memoria: esportare un backup prima di chiuderla.

I precedenti backup monoanno sono importabili e migrati automaticamente. L’importazione valida l’intero archivio prima di sostituire i dati correnti; un file non valido non li modifica. Importare un backup sostituisce l’archivio, non unisce gli anni. Il formato multianno ha `version: 2`, `selectedYear` e `years`; ogni anno mantiene il formato del motore `version: 1`. Un archivio vuoto è rappresentato da `selectedYear: null` e `years: {}` ed è esportabile e importabile.

I CSV esportano il mese o il riepilogo dell’anno selezionato, con separatore `;`, decimali italiani e BOM UTF-8 per Excel. Non sono backup reimportabili. **Stampa / PDF** apre la stampa del browser.

## Calendario e turnazione di riferimento

**Crea nuovo anno** apre un popup con anno, modalità, ciclo, ordine dei turni e data iniziale. Si chiude con ×, Esc o clic fuori dal riquadro; gli errori restano nel popup senza perdere i campi compilati. La continuazione automatica dall’anno precedente è disponibile se esiste un riferimento periodico o un suffisso recente con almeno due ripetizioni complete. Mantiene la fase fra il 31 dicembre e il 1° gennaio, anche negli anni bisestili. Non copia pagamenti, ferie, compensativi, straordinari o quantità da cedolino.

Per un nuovo ciclo si può scegliere **6 + 2**, **4 + 2**, **5 + 2** oppure **3 + 1**. Gli ordini disponibili sono **Mattina → Pomeriggio → Notte**, **Pomeriggio → Notte → Mattina**, **Notte → Pomeriggio → Mattina** e **Giornata ordinaria**. Ogni blocco contiene i giorni lavorativi dello stesso turno, poi i riposi del ciclo scelto; il blocco successivo passa al turno seguente. La data iniziale può precedere l’anno per rappresentare correttamente la fase. Il 5 + 2 segue questa data, non impone automaticamente lunedì–venerdì. I cicli già salvati nei backup restano validi, anche se usano un singolo turno.

Il nuovo anno viene interamente compilato: **8 h** per giorno lavorativo, **0 h** per R. Non vengono indovinati C, ferie o altre assenze. Le tariffe sono copiate dall’anno precedente se presente; progressivi esterni, pagamenti reali e premio di produzione ripartono da zero. I dodici mesi sono inclusi e i ratei di tredicesima iniziali sono dodici.

La turnazione generata viene bloccata come riferimento. **Blocca turnazione di riferimento** permette di fotografare anche un calendario già esistente; i giorni mancanti sono conservati come vuoti. Il blocco protegge la copia di riferimento, **non impedisce di modificare il calendario**. **Ripristina turnazione** ripristina tutti i giorni dell’anno, incluse ore, festività personalizzate e straordinari fotografati; non cambia parametri mensili o pagamenti reali. Sostituire un riferimento o ripristinare richiede conferma. Un anno già esistente non viene sovrascritto dalla creazione.

**Elimina anno** rimuove l’anno selezionato, inclusi turni, parametri, riferimento e pagamenti, solo dopo conferma. Gli altri anni restano intatti; viene selezionato il precedente disponibile oppure il primo successivo. Eliminare un anno può cambiare la calibrazione dell’anno seguente, che non avrà più quei campioni. È possibile eliminare anche l’ultimo anno: l’archivio rimane vuoto anche alla riapertura, senza ricreare i dati iniziali. Si può poi creare un nuovo anno o importare un backup. La cancellazione non è annullabile senza un backup.

Il giorno odierno è identificato da un pallino verde e da `aria-current="date"`, secondo la data locale del dispositivo. Le note tecniche dell’importazione non sono mostrate sotto ai giorni. La legenda **Sigle e colori dei turni** è sempre visibile sopra il calendario, senza tendina.

## Ore e voci retributive

| Sigla | Significato | Ore proposte |
|---|---|---:|
| 0 | Giornata ordinaria | 8 |
| 1 / 2 / 3 | Mattina / pomeriggio / notte | 8 |
| R | Riposo non retribuito | 0 |
| C | Riposo turno retribuito alla base | 8 |
| F / P / L | Ferie / festività goduta / ROL | 8 |
| H | Festività non goduta | 6,67 |
| M | Malattia, stima alla base | 8 |
| Vuoto | Da compilare, non retribuito | 0 |

**C è pagato come richiesto dall’utente:** ore × paga base, in voce **X10879 · Ore riposo turno**, subito sotto la retribuzione ordinaria AA245. Concorre a ore retribuite, lordo, contributi e imponibile fiscale, ma non a ore lavorate, gettoni o maggiorazioni automatiche. Non viene sommato alle quantità di AA245.

Le ore ordinarie sono modificabili da 0 a 8, anche con virgola e senza frecce di incremento. La compilazione rapida sostituisce sigla e ore dell’intervallo, conservando gli straordinari. La spunta **Includi nel totale annuale** si trova accanto a ciascun mese nella tabella **Il tuo anno**: l’esclusione non cancella il mese né il pagamento reale, ma ne esclude i totali e i progressivi.

- Base iniziale: **11,68638 €/h**. Le maggiorazioni seguono sempre la formula **base × percentuale / 100**: 10%, 20%, 25%, 35%, 45%, 50% e 60%. Cambiare la base aggiorna immediatamente tariffe e importi di tutti i mesi dell’anno selezionato, incluse quantità da cedolino e rettifiche. Le tariffe sono mostrate in sola lettura, fino a cinque decimali; il calcolo conserva la precisione fino all’arrotondamento dell’importo mensile. I vecchi importi dedicati presenti nei backup sono ignorati e rimossi al salvataggio: anche le simulazioni storiche vengono quindi ricalcolate con le percentuali, senza riscrivere i PDF di riferimento o i pagamenti reali.
- Premio mensile iniziale **51,67 €**, giugno storico **43,33 €**. La casella accanto alla voce nel dettaglio stipendio lo include/esclude **solo per il mese selezionato**, senza cancellare importi o quantità storiche. Valore predefinito ed eventuale eccezione del mese si modificano in **Regole e parametri del calcolo**; eccezione vuota = predefinito.
- Turnazione continua **25% MD0251**: quota mensile indipendente, normalmente **40 h**. Non è applicata a tutte le ore lavorate. Anche questa voce ha una casella diretta nel dettaglio, senza duplicare il controllo nei parametri; disattivarla conserva le quantità, comprese quelle sostitutive da cedolino.
- **10% S16310**: mattine lunedì–venerdì non festive. Quantità mensile vuota = automatica; un numero la sostituisce.
- Pomeriggio feriale: 20% sulle sole ore effettive 18–22; 5,5 h da inizio turno 14:00 generano 1,5 h serali.
- Sabato diurno 45%, domenica/festivo diurno 50%. Di notte: **60% solo sulle ore effettivamente lavorate di domenica**, **35% sul resto**, anche per festività infrasettimanali. Il 25% mensile è una voce indipendente opzionale.
- Ora iniziale notte predefinita **22:00**, modificabile nei parametri, anche frazionaria (`22,5` = 22:30). Le ore sono ripartite a mezzanotte: sabato 22–domenica 06 = **2 h al 35% + 6 h al 60%**; domenica 22–lunedì 06 = **2 h al 60% + 6 h al 35%**; venerdì 22–sabato 06 = **8 h al 35%**. Vale anche per presenze parziali. Ore e importi sono comunque attribuiti al mese/anno d’inizio.
- Gettoni iniziali: diurno feriale 2 €, notte feriale 4 €, diurno weekend 30 €, notte weekend 35 €. Classificazione dal **solo giorno iniziale**, senza guardare il giorno successivo: venerdì notte 4 €, sabato/domenica notte 35 €. Weekend sostituisce il feriale; una presenza parziale positiva riceve un gettone. Il festivo del giorno iniziale resta equiparato al weekend; un festivo successivo non cambia il gettone.
- Ferie, H, P, ROL e C generano solo la base. M è una stima alla base, non il calcolo delle indennità INPS o delle integrazioni aziendali.
- Festività nazionali automatiche, Pasqua/Pasquetta comprese. “Festivo: sì/no/auto” cambia la classificazione delle maggiorazioni, non aggiunge ore H. La domenica resta domenica anche selezionando “no”.
- Straordinario separato per giorno, anche nei riposi: 0–16 ore aggiuntive e maggiorazione manuale 0–1.000%. Importo = ore × base × (1 + percentuale / 100). Concorre a ore lavorate/retribuite, lordo e imposte, senza generare automaticamente gettoni. È raggruppato per percentuale; disattivarlo azzera le ore, conservando la percentuale.

Le quantità da cedolino sostituiscono le rispettive voci automatiche, non riscrivono i giorni. Zero esclude una voce; vuoto ripristina l’automatismo. **Usa quantità del cedolino** applica esplicitamente i dati PDF disponibili. I vecchi salvataggi non ricevono sostituzioni sopra le modifiche personali. Modificare le ore del 25% aggiorna anche l’eventuale sostituzione MD0251.

## Calibrazione intelligente

Le metriche principali sono **netto calibrato** e **lordo calibrato statistico**. La **calibrazione intelligente è sempre attiva**, senza interruttore né preferenza per anno. La tendina, chiusa inizialmente, mostra correzione %, provenienza dei campioni e limiti; chiuderla non disattiva il calcolo. Le vecchie preferenze di disattivazione nei backup sono ignorate e rimosse al salvataggio. Se mancano campioni sufficienti, le metriche mostrano “—”, senza inventare una previsione o sostituirla con valori da regole. Le voci contrattuali restano nel dettaglio stipendio e nel CSV.

Per ciascun mese si usano i mesi **precedenti dello stesso anno e quelli dell’anno immediatamente precedente**, se presente nell’archivio. I campioni devono essere inclusi nel rispettivo riepilogo e avere netto reale, netto da regole e lordo positivi. Il nuovo anno eredita così i dati della correzione senza attendere due nuovi pagamenti; i pagamenti successivi aggiornano il fattore insieme allo storico. Si usano i calcoli originali dell’anno precedente, non le sue proiezioni già calibrate, evitando una correzione doppia. Il pagamento dello stesso mese e quelli futuri non entrano nella previsione. Sono esclusi campioni con tredicesima/premio di produzione e ore pagate fuori dall’intervallo **metà–doppio delle ore del mese target**. Questo evita che il maggio iniziale di 40 h condizioni un mese pieno. Se le ore non sono disponibili, resta il filtro sugli importi. Senza dati nell’anno immediatamente precedente non si inventano campioni e non si recuperano anni più lontani.

Con almeno tre campioni, si scartano i rapporti `reale / calcolato` distanti dalla mediana oltre `max(3 × MAD, 0,05)`; MAD è la mediana delle distanze assolute. Servono almeno **due campioni rimasti**:

`fattore = somma netti reali / somma netti calcolati`

`correzione % = 100 × (fattore − 1)`

`lordo/netto calibrato = arrotonda(lordo/netto da regole × fattore)`

La ponderazione dà meno peso ai mesi con importi piccoli. Nessun moltiplicatore è limitato o corretto di nascosto. Con dati insufficienti, importi non positivi o mese escluso la proiezione mensile è **non disponibile**, non zero e non una copia silenziosa dell’originale. Nel totale annuale, per ciascun mese incluso si usa il **netto calibrato se disponibile, altrimenti il netto reale inserito**: mai entrambi. Anche un reale pari a zero copre il mese. Se mancano entrambi, il totale resta parziale; il riepilogo mostra distintamente mesi calibrati, mesi completati con pagamenti reali e copertura complessiva.

L’errore percentuale visibile in primo piano, nel confronto mensile e nella tabella annuale è `100 × (netto calibrato − reale) / reale`, arrotondato a due decimali: positivo = sovrastima, negativo = sottostima. Con reale zero la percentuale è **non definibile** (`n.d.`); con netto calibrato o reale mancante è `—`. Il confronto mensile conserva anche l’errore del netto da regole, etichettato separatamente. Il CSV esporta errore calibrato, delta e progressivo calibrato; percentuali non definibili o mancanti restano vuote.

**Limite essenziale:** dal solo netto non si ricavano con certezza lordo e imponibile. La calibrazione non modifica ore, tariffe, contributi, IRPEF, progressivi fiscali o voci del calcolo contrattuale. Il progressivo dei lordi calibrati nella tabella annuale è solo statistico. Il lordo calibrato non è un cedolino ricostruito; anche il netto calibrato può sbagliare, soprattutto con pochi campioni o voci straordinarie. Tredicesima e premio di produzione possono ricevere una previsione, ma non addestrano il fattore.


## Tredicesima e premio di produzione

Tredicesima stimata a dicembre:

`lordo = base oraria × ore della base mensile × ratei / 12`

Le ore mensili iniziali sono **173**, i ratei iniziali dello storico 2026 **7** (giugno–dicembre), da verificare secondo l’effettiva maturazione. I nuovi anni iniziano con 12 ratei. I backup precedenti senza questi campi ricevono una stima dei ratei contando i mesi inclusi con almeno 15 giorni di calendario compilati: è un’ipotesi modificabile, non una verifica contrattuale. È possibile disattivare la tredicesima o inserire il lordo manuale; zero è un override valido, vuoto torna alla formula.

Il **premio di produzione** è un importo annuo aggiuntivo distinto dal premio mensile, con mese di pagamento selezionabile. Entrambe le voci entrano nel lordo del rispettivo mese e, dopo contributi, nell’imponibile ordinario progressivo per gli scaglioni IRPEF. Non vengono sommate una seconda volta all’annuale e non creano una tredicesima detrazione mensile. Eventuali regimi agevolati dei premi di risultato non sono presunti.

Se il mese di pagamento è escluso, la voce resta nella simulazione mensile ma non nei totali annui; l’app lo segnala.

## Dal lordo al netto

Arrotondamento ai centesimi dopo il raggruppamento mensile per voce, simmetrico anche per rettifiche negative.

1. Lordo = somma delle competenze, inclusi C, eventuali tredicesima e premio di produzione.
2. Contributi INPS + FSBS = lordo × **9,34%** iniziale. È una stima forfettaria, non replica i distinti arrotondamenti del cedolino.
3. Imponibile fiscale = lordo − contributi.
4. Tutto l’imponibile fiscale è ordinario: il regime sostitutivo del 15% è stato eliminato.
5. IRPEF cumulativa = `T(progressivo prima + imponibile mese) − T(progressivo prima)`.
6. Netto = lordo − contributi − IRPEF netta − addizionali − altre trattenute + rettifiche nette.

Il modello fiscale 2026 usa **23%** fino a 28.000 €, **33%** sulla quota 28.000–50.000 €, **43%** oltre 50.000 €. La soglia riguarda l’imponibile ordinario, non il lordo. Le aliquote marginali riguardano soltanto la quota eccedente. Per gli anni successivi il modello resta quello del 2026, con avvertenza: non è un aggiornamento automatico della normativa.

Il regime sostitutivo del **15% è rimosso dal motore**, non semplicemente nascosto. Anche un vecchio backup con l’opzione attiva usa soltanto l’IRPEF ordinaria; normalizzazione e nuovo salvataggio eliminano parametri, basi manuali e progressivi dismessi. Non viene invece eliminata la diversa detrazione da lavoro iniziale di **166 €/mese**. Il motore conserva il profilo alternativo “Specifiche originali”, le detrazioni art. 13 e le addizionali eventualmente già presenti negli archivi. Il contributo percentuale rimane modificabile.

La lista visibile delle tasse contiene soltanto **Contributi INPS + FSBS** e **IRPEF lorda cumulativa**. Quest’ultima è prima delle detrazioni, quindi non basta sottrarre le due righe visibili per ricostruire il netto. Gli altri importi eventualmente già salvati continuano a entrare nel calcolo.

L’IRPEF cumulativa non replica l’annualizzazione mensile del datore. Il conguaglio indicativo recupera eventuali detrazioni inutilizzate solo a livello annuale e non viene già aggiunto al netto. Con progressivi esterni ma senza imposte pregresse il conguaglio non è determinabile. Non è un modello 730.

Non automatizzati: TFR, welfare, ticket, cuneo fiscale, trattamento integrativo, rinnovi al 5%, familiari a carico, altri redditi, rimborsi 730, integrazioni contrattuali di malattia e disciplina agevolata dei premi di risultato.

## Riepiloghi e dati storici

Il grafico mensile ad anello ripartisce il lordo **da regole** fra netto prima delle rettifiche nette, imposte stimate, contributi e altre trattenute. Con totale nullo o componenti negative non rappresenta proporzioni fuorvianti. Il grafico annuale usa schede mensili con barre di **netto calibrato** e **netto reale**, importi espliciti e scala comune ai mesi inclusi. Traccia tratteggiata e “—” indicano dati mancanti, non zero. I mesi esclusi sono distinguibili e il mese selezionato è evidenziato. Importi negativi sono segnalati in rosso e rappresentati in valore assoluto. Le schede si dispongono su tre, due o una colonna in base allo schermo.

Il confronto con il pagamento reale si trova direttamente in **Il ritmo del tuo anno**. Il selettore **Mese del pagamento**, oppure il nome del mese nelle schede del grafico, permette di scegliere il mese da compilare senza tornare al calendario. L’importo salvato aggiorna grafico, tabella, riepilogo annuale e previsioni successive. Zero è un pagamento valido; campo vuoto indica dato mancante.

Il totale annuale principale combina **netti calibrati e, solo dove manca la stima, netti reali** dei mesi inclusi. Maggio, giugno e luglio dello storico iniziale sono così coperti dai relativi pagamenti, senza inventare stime mensili o lordi. Il totale effettivo resta separato e somma tutti i pagamenti manuali disponibili nei mesi inclusi. La **differenza calibrato − effettivo** e il suo **errore percentuale** considerano solo i mesi con entrambe le cifre disponibili: `100 × (somma calibrati confrontabili − somma reali confrontabili) / somma reali confrontabili`, non la media delle percentuali mensili. I reali usati per completare l’annuale non creano confronti artificialmente perfetti e le previsioni future non sono confrontate con pagamenti mancanti. Se la somma reale confrontabile è zero, la percentuale non è definibile. Netto reale zero è valido; campo vuoto significa mancante. Lo storico dell’anno precedente serve per il fattore, ma le sue retribuzioni non si sommano all’anno corrente. Il pagamento manuale alimenta le proiezioni dei mesi successivi, non altera il calcolo contrattuale.

La tabella mantiene i dodici mesi e mostra, dopo il mese con la spunta di inclusione: **ore lavorate, ore pagate, lordo, contributi, IRPEF, netto reale, netto calibrato, errore calibrato %, delta calibrato − reale, progressivo lordo calibrato**. Il progressivo somma esclusivamente i lordi calibrati dei mesi inclusi fino a quella riga; non inventa un lordo dal netto reale. Se mancano stime è parziale (`*`), se nessuna è disponibile è `—`. Non coincide con l’imponibile ordinario usato per le tasse: la barra della soglia mantiene il calcolo fiscale originale. Da telefono la tabella scorre orizzontalmente mantenendo il mese e la spunta visibili. Il CSV riporta anche l’indicazione esplicita di progressivo parziale.

La barra dell’imponibile ordinario progressivo segue lo scaglione corrente: fino a 28.000 € mostra l’avanzamento da zero; superati 28.000 € passa alla soglia di 50.000 € e riparte sulla sola fascia 28.000–50.000 € (a 39.000 € è al 50%). Oltre 50.000 € mostra l’ultimo scaglione al 43%, senza barra né soglie inventate. Alle soglie esatte la fascia appena completata resta piena fino al superamento. I calcoli fiscali non cambiano. Parametri, riconciliazione, dettagli della calibrazione e avvertenze sono raccolti in sezioni richiudibili.

`seed.js` conserva i dati anonimizzati del foglio 2026: 221 date dal 25 maggio al 31 dicembre, pagamenti maggio–ottobre e quantità dei cinque PDF giugno–ottobre. Gennaio–aprile restano esclusi; le 34 presenze senza ore sono pianificate a 8 h e restano previsioni, senza note nel calendario. Le giornate originali di 7 e 5,5 ore sono conservate.

I PDF restano riferimenti osservati, non vengono riscritti per far coincidere il modello aggiornato: C è ora una voce retribuita separata secondo la richiesta dell’utente. Il lordo simulato può quindi superare il riferimento PDF anche usando le altre quantità storiche. Nessun residuo artificiale pareggia il lordo o il netto. Le ore pagate dell’app includono C e festività aggiuntive e possono differire da “ORE RETR.” d’intestazione.

## Codice e verifiche

- `index.html`, `styles.css`: interfaccia, layout mobile e stampa.
- `app.js`: archivio multianno, migrazione dei backup, controlli, grafici e CSV.
- `payroll.js`: motore puro browser `MeloncinoEngine` / CommonJS.
- `calendar.js`: cicli UTC, generazione, inferenza conservativa e validazione dei riferimenti; API browser `MeloncinoCalendar` / CommonJS.
- `calibration.js`: proiezioni statistiche temporali, filtro per ore comparabili e scarti anomali; API browser `MeloncinoCalibration` / CommonJS.
- `seed.js`: dati iniziali e riferimenti, separati dalle modifiche personali.
- `payroll.test.js`, `calendar.test.js`, `calibration.test.js`: regressioni deterministiche.

```sh
node --test payroll.test.js calendar.test.js calibration.test.js
```

Verifica della barra: sintassi `app.js` valida e scenari Chromium con imponibile 28.000, 28.000,01, 39.000, 50.000 e 50.000,01 €, oltre al ritorno allo scaglione iniziale. Controllati intervalli e valori del misuratore, testi e ultimo scaglione. Verificati rimozione dei due titoli, legenda permanente, footer e assenza di debordi a 390 px; nessun errore JavaScript osservato. Schermate delle sei viste mobile salvate in `screenshots/` con viewport 390 × 844 e risoluzione doppia.

Verifica dell’aggiornamento: sintassi `app.js` verificata con Node e **78 test dei motori retributivo e di calibrazione verificati** (77 superati nella prima esecuzione; un’aspettativa della vecchia tariffa fissa aggiornata e il relativo test mirato superato). Coperti cambio base su tutte le percentuali, precisione, quantità da cedolino, rettifiche e backup legacy. In Chromium verificati modifica paga a 20 €/h, tariffa del 25% a 5 €/h con quantità da cedolino, pagamento reale nel grafico con zero/vuoto, cancellazione annullata/confermata, eliminazione dell’ultimo anno persistente, creazione da archivio vuoto, esportazione/importazione dell’archivio vuoto e migrazione di backup con calibrazione disattivata. Controllo visivo dei nuovi testi e del confronto su mobile, nessun debordo a 320 e 390 px e nessun errore JavaScript osservato. Conservate le regressioni permanenti; rimossi i dati temporanei di verifica.

## Fonti e limiti

- `Informazioni.txt` e precisazioni dell’utente: tariffe e regole aziendali.
- `OreLavoro.xlsx`, foglio 2026: pianificazione e pagamenti storici.
- Cinque PDF forniti: quantità e riferimenti retributivi/fiscali.
- [Ministero del Lavoro, Legge di bilancio 2026](https://www.lavoro.gov.it/notizie/pagine/legge-di-bilancio-2026-le-principali-misure-lavoratori-imprese-e-famiglie).
- [Legge 8 ottobre 2025 n. 151](https://www.gazzettaufficiale.it/eli/id/2025/10/10/25G00153/sg): festività di San Francesco dal 2026.

Strumento personale di previsione, non un cedolino certificato né una dichiarazione fiscale. Verificare condizioni personali, ratei e accordi aziendali con l’ufficio paghe. I backup contengono dati economici: conservarli con le cautele dei cedolini. L’eventuale sincronizzazione OneDrive è distinta dal funzionamento offline dell’app.
