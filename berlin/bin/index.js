'use strict'

const ProgressBar = require('progress')
const async = require('async')
const URL = require('url')
const pr = require('path').resolve
const fs = require('fs-extra')
const Scrapyard = require('scrapyard')

var scraper = new Scrapyard({
  debug: true,
  retries: 5,
  connections: 10
  // cache: './storage',
  // bestbefore: "5min"
})

const fetchSchool = require('./lib/fetch-school')

const OUTPUT_DIR = pr(__dirname, '../output')

function scrape (url, method = 'GET', formdata) {
  return new Promise(function (resolve, reject) {
    scraper({
      url: url,
      type: 'html',
      method: method,
      form: formdata,
      jar: true
    }, function (err, $) {
      if (err) {
        reject(err)
      } else {
        resolve($)
      }
    })
  })
}

function parseSchoollist ($) {
  let url = 'http://www.berlin.de/sen/bildung/schulverzeichnis_und_portraets/anwendung/SchulListe.aspx'
  let $rows = $('#DataListSchulen tr')
  let schools = $rows.map((i, tr) => ({
    id: $(tr).find('[id^=DataListSchulen_HLinkSchulNr_]').attr('href').split('?IDSchulzweig=')[1].trim(),
    code: $(tr).find('[id^=DataListSchulen_HLinkSchulNr_]').text().trim(),
    entryURL: URL.resolve(url, $(tr).find('[id^=DataListSchulen_HLinkSchulNr_]').attr('href')),
    name: $(tr).find('[id^=DataListSchulen_lblSchulName_]').text().trim(),
    type: $(tr).find('[id^=DataListSchulen_lblSchulart_]').text().trim(),
    bezirk: $(tr).find('[id^=DataListSchulen_lblBezirk_]').text().trim(),
    ortsteil: $(tr).find('[id^=DataListSchulen_lblOrtsteil_]').text().trim()
  })).get()
  return schools
}

function getSchoolList (postdata = {}) {
  return new Promise(function (resolve, reject) {
    console.log('Fetching overview of all schools...')
    scrape('https://www.berlin.de/sen/bildung/schule/berliner-schulen/schulverzeichnis/SchulListe.aspx', 'POST', postdata)
      .then($ => { resolve(parseSchoollist($)) })
      .catch(console.log)
  })
}

// getSchoolList fetches the overview
getSchoolList()
  // .then(schools => schools.filter(school => school.name === 'Albert-Einstein-Gymnasium'))
  .then(schools => {
    let bar = new ProgressBar('Fetching details, current id: :token [:bar] (:current/:total, :eta seconds remaining)', { total: schools.length })

    async.eachSeries(schools, (school, schoolDone) => {
      let outputPath = pr(OUTPUT_DIR, school.id + '.json')

      // is the school already fetched and in our cache?
      if (fs.existsSync(outputPath)) {
        // yes it is!
        bar.tick({ token: school.code })
        return schoolDone()
      }

      // no, it's not.
      fetchSchool(school)
        .then(school => {
          bar.tick({ token: school.id })
          fs.outputFile(
            outputPath,
            JSON.stringify(school),
            _ => setTimeout(schoolDone, Math.random() * 3) // be nice to the server
          )
        })
        .catch(_ =>
          setTimeout(schoolDone, Math.random() * 10) // be even nicer to the server
        )
    }, function allDone (err) {
      if (err) console.error(err.stack)
      let data = fs.readdirSync(OUTPUT_DIR)
        .filter(file => /\.json$/.test(file))
        .map(file => JSON.parse(fs.readFileSync(pr(OUTPUT_DIR, file))))
      fs.outputFileSync('schools.json', JSON.stringify(data))
      console.log(`Done, wrote results to ${pr(__dirname, 'schools.json')}`)
    })
  })
  .catch(e => console.error(e.stack))
