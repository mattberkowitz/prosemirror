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
  finds.forEach(selection => pm.markRange(selection.from, selection.to, {className: pm.mod.find.findClass, volatile: true}))
}

CommandSet.default = CommandSet.default.add({
  find: {
    label: "Find occurances of a string",
    run: function(pm, findTerm) {
      pm.mod.find.find(findTerm)
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find..."}
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
  replace: {
    label: "Replaces selected/next occurance of a string",
    run: function(pm, findTerm, replaceWith) {
      pm.mod.find.replace(findTerm, replaceWith)
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find..."},
      {label: "Replace", type: "text", defaultLabel: "Replace With..."}
    ],
    keys: ["Shift-Mod-F"]
  },
  replaceAll: {
    label: "Replaces all occurances of a string",
    run: function(pm, findTerm, replaceWith) {
      pm.mod.find.replaceAll(findTerm, replaceWith)
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find..."},
      {label: "Replace", type: "text", defaultLabel: "Replace With..."}
    ],
    keys: ["Shift-Alt-Mod-F"]
  }
})

class FindResult {
  constructor(pm, findTerm, caseSensitive = true) {
    this.pm = pm
    this.findTerm = findTerm
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
    this.findClass = options.findClass || "find"
    this.options = options
    pm.mod.find = this


    if(!this.options.noCommands) updateCommands(pm, CommandSet.default)

  }

  detach() {
    this.clearFind()
  }

  find(findTerm, node = this.pm.doc) {
    if(this.findResult) this.clearFind();

    this.findResult = new FindResult(this.pm, findTerm)
    let selections = this.findResult.results()
    selectNext(this.pm, selections)

    if(this.options.highlightAll) {
      markFinds(pm, selections)
      addInputRule(pm, this.findResult.autoInputRule)
    }

    return selections
  }

  findNext() {
    if(this.findResult) {
      let selections = this.findResult.results()
      selectNext(pm, selections)
    }
  }

  clearFind() {
    this.pm.ranges.ranges.filter(r => r.options.className === this.findClass).forEach(r => this.pm.ranges.removeRange(r))
    if(this.findResult.autoInputRule) {
      removeInputRule(pm, this.findResult.autoInputRule)
    }
    this.findResult = null
  }

  replace(findTerm, replaceWith) {
    let findResult = new FindResult(this.pm, findTerm)
    if(this.pm.doc.sliceBetween(this.pm.selection.from, this.pm.selection.to).textContent !== findTerm) {
      if(!selectNext(pm, findResult.results())) {
        return
      }
    }
    this.pm.tr.typeText(replaceWith).apply()
    selectNext(pm, findResult.results())
  }

  replaceAll(findTerm, replaceWith) {
    let findResult = new FindResult(this.pm, findTerm),
        selections = findResult.results(),
        selection, transform;
    while(selection = selections.shift()) {
      this.pm.setSelection(selection)
      transform = this.pm.tr.typeText(replaceWith).apply()
      selections = selections.map(s => s.map(this.pm.doc, transform.maps[0]))
    }
  }


}
