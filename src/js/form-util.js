import removeAccents from 'remove-accents'

import { $, $$, downloadBlob } from './dom-utils'
import { addSlash, getFormattedDate } from './util'
import pdfBase from '../certificate.pdf'
import { generatePdf } from './pdf-util'
import SecureLS from 'secure-ls'
import JSZip from 'jszip'

const secureLS = new SecureLS({ encodingType: 'aes' })
const clearDataSnackbar = $('#snackbar-cleardata')
const storeDataInput = $('#field-storedata')
const conditions = {
  '#field-firstname': {
    length: 1,
  },
  '#field-lastname': {
    length: 1,
  },
  '#field-birthday': {
    pattern: /^([0][1-9]|[1-2][0-9]|30|31)\/([0][1-9]|10|11|12)\/(19[0-9][0-9]|20[0-1][0-9]|2020)/g,
  },
  '#field-placeofbirth': {
    length: 1,
  },
  '#field-address': {
    length: 1,
  },
  '#field-city': {
    length: 1,
  },
  '#field-zipcode': {
    pattern: /\d{5}/g,
  },
  '#field-datesortie': {
    pattern: /\d{4}-\d{2}-\d{2}/g,
  },
  '#field-heuresortie': {
    pattern: /\d{2}:\d{2}/g,
  },
}

function validateAriaFields () {
  return Object.keys(conditions)
    .map((field) => {
      const fieldData = conditions[field]
      const pattern = fieldData.pattern
      const length = fieldData.length
      const isInvalidPattern = pattern && !$(field).value.match(pattern)
      const isInvalidLength = length && !$(field).value.length

      const isInvalid = !!(isInvalidPattern || isInvalidLength)

      $(field).setAttribute('aria-invalid', isInvalid)
      if (isInvalid) {
        $(field).focus()
      }
      return isInvalid
    })
    .includes(true)
}

function updateSecureLS (formInputs) {
  if (wantDataToBeStored() === true) {
    secureLS.set('profile', getProfile(formInputs))
  } else {
    clearSecureLS()
  }
}

function clearSecureLS () {
  secureLS.clear()
}

function clearForm () {
  const formProfile = $('#form-profile')
  formProfile.reset()
  storeDataInput.checked = false
}

function setCurrentDate (releaseDateInput) {
  const currentDate = new Date()
  releaseDateInput.value = getFormattedDate(currentDate)
}

function showSnackbar (snackbarToShow, showDuration = 6000) {
  snackbarToShow.classList.remove('d-none')
  setTimeout(() => snackbarToShow.classList.add('show'), 100)

  setTimeout(function () {
    snackbarToShow.classList.remove('show')
    setTimeout(() => snackbarToShow.classList.add('d-none'), 500)
  }, showDuration)
}

export function wantDataToBeStored () {
  return storeDataInput.checked
}

export function setReleaseDateTime (releaseDateInput) {
  const loadedDate = new Date()
  releaseDateInput.value = getFormattedDate(loadedDate)
  $('#field-placeofbirth').value = "Paris"
  $('#field-heuresortie').value = "00:00"
  $('#field-numberToGen').value = "1"
}

export function toAscii (string) {
  if (typeof string !== 'string') {
    throw new Error('Need string')
  }
  const accentsRemoved = removeAccents(string)
  const asciiString = accentsRemoved.replace(/[^\x00-\x7F]/g, '') // eslint-disable-line no-control-regex
  return asciiString
}

export function getProfile (formInputs) {
  const fields = {}
  for (const field of formInputs) {
    let value = field.value
    if (field.id === 'field-datesortie') {
      const dateSortie = field.value.split('-')
      value = `${dateSortie[2]}/${dateSortie[1]}/${dateSortie[0]}`
    }
    if (typeof value === 'string') {
      value = toAscii(value)
    }
    fields[field.id.substring('field-'.length)] = value
  }
  return fields
}

export function getReasons (reasonInputs) {
  const reasons = reasonInputs
    .filter(input => input.checked)
    .map(input => input.value).join(', ')
  return reasons
}
export function getMassGenType (massGenTypeInputs) {
  return massGenTypeInputs.find(
    input => input.checked).value
}

export function prepareInputs (formInputs, reasonInputs, massGenTypeInputs, reasonFieldset, reasonAlert, snackbar, releaseDateInput) {
  const lsProfile = secureLS.get('profile')

  // Continue to store data if already stored
  storeDataInput.checked = !!lsProfile
  formInputs.forEach((input) => {
    if (input.name && lsProfile && input.name !== 'datesortie' && input.name !== 'heuresortie' && input.name !== 'field-reason'
    && input.name !== 'field-massGenType') {
      input.value = lsProfile[input.name]
    }
    const exempleElt = input.parentNode.parentNode.querySelector('.exemple')
    if (input.placeholder && exempleElt) {
      input.addEventListener('input', (event) => {
        if (input.value) {
          updateSecureLS(formInputs)
          exempleElt.innerHTML = 'ex.&nbsp;: ' + input.placeholder
        } else {
          exempleElt.innerHTML = ''
        }
      })
    }
  })

  $('#field-birthday').addEventListener('keyup', function (event) {
    event.preventDefault()
    const input = event.target
    const key = event.keyCode || event.charCode
    if (key !== 8 && key !== 46) {
      input.value = addSlash(input.value)
    }
  })

  reasonInputs.forEach(radioInput => {
    radioInput.addEventListener('change', function (event) {
      const isInError = reasonInputs.every(input => !input.checked)
      reasonFieldset.classList.toggle('fieldset-error', isInError)
      reasonAlert.classList.toggle('hidden', !isInError)
    })
  })
  $('#cleardata').addEventListener('click', () => {
    clearSecureLS()
    clearForm()
    setCurrentDate(releaseDateInput)
    showSnackbar(clearDataSnackbar, 3000)
  })
  $('#field-storedata').addEventListener('click', () => {
    updateSecureLS(formInputs)
  })
  $('#generate-btn').addEventListener('click', async (event) => {
    event.preventDefault()

    const reasons = getReasons(reasonInputs)
    console.log({reasons})
    if (!reasons) {
      reasonFieldset.classList.add('fieldset-error')
      reasonAlert.classList.remove('hidden')
      reasonFieldset.scrollIntoView && reasonFieldset.scrollIntoView()
      return
    }

    const invalid = validateAriaFields()
    if (invalid) {
      return
    }
    updateSecureLS(formInputs)
    const numberToGen = parseInt($('#field-numberToGen').value)
    let totalGeneratedFiles = 0
    const initialReleaseDate = `${$('#field-datesortie').value}`
    const zip = new JSZip();
    console.log({numberToGen, initialReleaseDate})

    const addDaysToDate = (_date, days) => {
      const dateD = new Date(_date)
      return new Date(dateD.setDate(dateD.getDate() + days)).toISOString().substr(0, 10)
    }
    const useMinuteWiseSettings = async (dayIndex, min) =>
    {
      const initialHeureSortie = $('#field-heuresortie').value
      let heureSortie = parseInt($('#field-heuresortie').value.substr(0, 2))
      let minuteSortie = parseInt($('#field-heuresortie').value.substr(3, 2))
      const initialMinuteSortie = minuteSortie
      while (heureSortie < 24){
        let heureSortieStr = `${heureSortie}`;
        if (heureSortie < 10){
          heureSortieStr = `0${heureSortie}`;
        }
        while (minuteSortie < 60){

          let minuteSortieStr = `${minuteSortie}`;
          if (minuteSortie < 10){
            minuteSortieStr = `0${minuteSortie}`;
          }
          console.log({heureSortieStr, minuteSortieStr, h:`${heureSortieStr}:${minuteSortieStr}`})
          $('#field-heuresortie').value = `${heureSortieStr}:${minuteSortieStr}`
          const pdfBlob = await generatePdf(getProfile(formInputs), reasons, pdfBase)
          zip.file(`${addDaysToDate(initialReleaseDate, dayIndex)}/${heureSortieStr}h${minuteSortieStr}_${reasons.replaceAll(/, /g, "_")}.pdf`, pdfBlob)
          totalGeneratedFiles++
          minuteSortie += min
        }
        minuteSortie = initialMinuteSortie
        heureSortie++
      }
      $('#field-heuresortie').value = initialHeureSortie
    }
    for (let i = 0; i < numberToGen; i++){
      const massGenType = getMassGenType(massGenTypeInputs)
      $('#field-datesortie').value = addDaysToDate(initialReleaseDate, i)
      if (typeof massGenType === "undefined" || massGenType === "day"){
        const pdfBlob = await generatePdf(getProfile(formInputs), reasons, pdfBase)
        zip.file(`${addDaysToDate(initialReleaseDate, i)}_${reasons.replaceAll(/, /g, "_")}.pdf`, pdfBlob)
        totalGeneratedFiles++
      }
      else if (massGenType === "hour"){
        const initialHeureSortie = $('#field-heuresortie').value
        let heureSortie = $('#field-heuresortie').value.substr(0, 2)
        const minuteSortie = $('#field-heuresortie').value.substr(3, 2)
        while (heureSortie < 24){
          let heureSortieStr = `${heureSortie}`;
          let minuteSortieStr = `${minuteSortie}`;
          if (heureSortie < 10){
            heureSortieStr = `0${heureSortie}`;
          }
          if (minuteSortie < 10){
            minuteSortieStr = `0${minuteSortie}`;
          }
          console.log({heureSortieStr, minuteSortieStr, h:`${heureSortieStr}:${minuteSortieStr}`})
          $('#field-heuresortie').value = `${heureSortieStr}:${minuteSortieStr}`
          const pdfBlob = await generatePdf(getProfile(formInputs), reasons, pdfBase)
          zip.file(`${addDaysToDate(initialReleaseDate, i)}_${heureSortieStr}h_${reasons.replaceAll(/, /g, "_")}.pdf`, pdfBlob)
          totalGeneratedFiles++
          heureSortie++
        }
        $('#field-heuresortie').value = initialHeureSortie
      }
      else if (massGenType === "demiheure"){
        await useMinuteWiseSettings(i, 30)
      }
      else if (massGenType === "quartdheure"){
        await useMinuteWiseSettings(i, 15)
      }
      else if (massGenType === "cinqminutes"){
        await useMinuteWiseSettings(i, 5)
      }
    }

    const creationInstant = new Date()
    const creationDate = creationInstant.toLocaleDateString('fr-CA')
    const creationHour = creationInstant
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', '-')
    console.log({zip})
    const path = `${totalGeneratedFiles}_attestations.zip`;
    await zip.generateAsync({type:"blob"})
      .then(function(content) {
          // see FileSaver.js
        downloadBlob(content, path)
          //saveAs(, path);
      });
    showSnackbar(snackbar, 6000)
  })
}

export function prepareForm () {
  const formInputs = $$('#form-profile input')
  const snackbar = $('#snackbar')
  const reasonInputs = [...$$('input[name="field-reason"]')]
  const massGenTypeInputs = [...$$('input[name="field-massGenType"]')]
  const reasonFieldset = $('#reason-fieldset')
  const reasonAlert = reasonFieldset.querySelector('.msg-alert')
  const releaseDateInput = $('#field-datesortie')
  setReleaseDateTime(releaseDateInput)
  prepareInputs(formInputs, reasonInputs, massGenTypeInputs, reasonFieldset, reasonAlert, snackbar, releaseDateInput)
}
