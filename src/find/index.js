import {defineOption} from "../edit"
import {updateCommands, Command, CommandSet} from "../edit/command"
import {TextSelection} from "../edit/selection"
import {Textblock} from "../model"
import {Pos} from "../model"
import {addInputRule, removeInputRule, InputRule} from "../inputrules"

defineOption("find", false, (pm, value) => {
  if (pm.mod.find) {
    pm.mod.find.detach()
    pm.mod.find = null
  }

  if (value) {
    pm.mod.find = new Find(pm, value)
  }
})


//Currently this only ever is executed on pm.doc, but it could be used on a subtree also
function findInNode(node, findResult, path = []) {
  let ret = []

  //Not sure this is the right way to do this, but it works. node.isText() drills down to
  //individual text fragments, which wouldn't catch something like blo*ck* (markdown) searching for "block"
  if(node.type instanceof Textblock) {
    let index = 0, foundAt
    while((foundAt = node.textContent.slice(index).search(findResult.findRegExp)) > -1) {
      ret.push(new TextSelection(new Pos(path, index + foundAt), new Pos(path, index + foundAt + findResult.findTerm.length)))
      index = index + foundAt + findResult.findTerm.length
    }
  } else {
    node.content.forEach((child, i) => ret = ret.concat(findInNode(child, findResult, path.concat(i))))
  }
  return ret
}


//Finds the selection that comes after the end of the current selection
function selectNext(pm, selections) {
  if(selections.length === 0) {
    return false //bail if theres no selections
  }
  for(let i=0;i<selections.length;i++) {
    if(pm.selection.to.cmp(selections[i].from) <= 0) {
      pm.setSelection(selections[i])
      return selections[i]
    }
  }
  pm.setSelection(selections[0])
  return selections[0];
}


function markFinds(pm, finds) {
  //I added volatile option to MarkedRange, to destroy a range when it's content changes
  finds.forEach(selection => pm.markRange(selection.from, selection.to, {className: pm.mod.find.options.findClass, volatile: true}))
}

function defaultFindTerm(pm) {
  if(!pm.selection.empty) {
    return pm.doc.sliceBetween(pm.selection.from, pm.selection.to).textContent
  }
  if(pm.mod.find.findResult) {
    return pm.mod.find.findResult.findTerm
  }
  return null
}

function defaultReplaceWith(pm) {
  if(pm.mod.find.findResult) {
    return pm.mod.find.findResult.replaceWith
  }
  return null
}


//Unsure if this is the correct way to add new commands
CommandSet.default = CommandSet.default.add({
  find: {
    label: "Find occurances of a string",
    run: function(pm, findTerm) {
      pm.mod.find.find(findTerm)
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find...", prefill: defaultFindTerm}
    ],
    keys: ["Mod-F"]
  },
  findNext: {
    label: "Find next occurance of last searched string",
    run: function(pm) {
      pm.mod.find.findNext()
    },
    keys: ["Alt-Mod-F"]
  },
  clearFind: {
    label: "Clear highlighted finds",
    run: function(pm) {
      pm.mod.find.clearFind()
    }
  },
  replace: {
    label: "Replaces selected/next occurance of a string",
    run: function(pm, findTerm, replaceWith) {
      pm.mod.find.replace(findTerm, replaceWith)
    },
    params: [
      {label: "Find", type: "text", prefill: defaultFindTerm},
      {label: "Replace", type: "text", prefill: defaultReplaceWith}
    ],
    keys: ["Shift-Mod-F"]
  },
  replaceAll: {
    label: "Replaces all occurances of a string",
    run: function(pm, findTerm, replaceWith) {
      pm.mod.find.replaceAll(findTerm, replaceWith)
    },
    params: [
      {label: "Find", type: "text", prefill: defaultFindTerm},
      {label: "Replace", type: "text", prefill: defaultReplaceWith}
    ],
    keys: ["Shift-Alt-Mod-F"]
  }
})

class FindResult {
  constructor(pm, findTerm, replaceWith, caseSensitive = true) {
    this.pm = pm
    this.findTerm = findTerm
    this.replaceWith = replaceWith
    this.caseSensitive = caseSensitive
    this.autoInputRule = new InputRule(this.autoInputRegExp, null, (pm) => {
      markFinds(pm, [new TextSelection(new Pos(pm.selection.from.path, pm.selection.from.offset - findTerm.length), pm.selection.from)])
    })
  }

  get findRegExp() {
    return RegExp(this.findTerm, !this.caseSensitive ? "i" : "")
  }

  get autoInputRegExp() {
    return RegExp(this.findTerm + "$", !this.caseSensitive ? "i" : "")
  }

  results() {
    return findInNode(this.pm.doc, this)
  }
}

class Find {
  constructor(pm, options) {
    this.pm = pm
    this.findResult = null

    this.options = Object.create(this.defaultOptions)
    for(let option in options){
      this.options[option] = options[option]
    }

    pm.mod.find = this

    if(!this.options.noCommands) updateCommands(pm, CommandSet.default)
  }

  detach() {
    this.clearFind()
  }

  get defaultOptions() {
    return {
      highlightAll: true, //add a MarkedRange to all matchs
      findNextAfterReplace: true, //execute a find after
      findClass: "find", //class to add to highlightAll MarkedRanges
      noCommands: false //set to true to skip adding commands, useful for non-standard UI
    }
  }

  get findResult() {
    return this._findResult
  }

  set findResult(val) {
    if(this._findResult) this.clearFind() //clear out existing results if there are any
    this._findResult = val
  }

  find(findTerm, node = this.pm.doc) {
    this.findResult = new FindResult(this.pm, findTerm)

    let selections = this.findResult.results()
    selectNext(this.pm, selections)

    if(this.options.highlightAll) {
      markFinds(pm, selections)
      //Add an input rule to highlight newly typed matches. This works, but I don't love it
      //It doesn't capture pasted matches, and doesn't catch matches completed from anywhere but
      //the end (ie I search for "block" then add an "o" to "blck")
      addInputRule(pm, this.findResult.autoInputRule)
    }

    return selections
  }

  findNext() {
    if(this.findResult) {
      let selections = this.findResult.results()
      return selectNext(pm, selections)
    }
    return null
  }

  clearFind() {
    if(this.options.highlightAll) {
      this.pm.ranges.ranges.filter(r => r.options.className === this.options.findClass).forEach(r => this.pm.ranges.removeRange(r))
      removeInputRule(pm, this.findResult.autoInputRule)
    }
    this._findResult = null
  }

  replace(findTerm, replaceWith) {
    this.findResult = new FindResult(this.pm, findTerm, replaceWith)

    if(this.pm.doc.sliceBetween(this.pm.selection.from, this.pm.selection.to).textContent !== findTerm) {
      if(!selectNext(pm, this.findResult.results())) {
        return false
      }
    }
    this.pm.tr.typeText(replaceWith).apply()

    if(this.options.findNextAfterReplace) {

      let otherResults = this.findResult.results()
      if(this.options.highlightAll && otherResults.length) {
        markFinds(pm, otherResults)
        addInputRule(pm, this.findResult.autoInputRule)
      }
      selectNext(pm, otherResults)

    }

    return true
  }

  replaceAll(findTerm, replaceWith) {
    this.findResult = new FindResult(this.pm, findTerm, replaceWith)

    let selections = this.findResult.results(),
        selection, transform;

    while(selection = selections.shift()) {
      this.pm.setSelection(selection)
      transform = this.pm.tr.typeText(replaceWith).apply()
      selections = selections.map(s => s.map(this.pm.doc, transform.maps[0]))
    }
    return selections.length
  }


}
