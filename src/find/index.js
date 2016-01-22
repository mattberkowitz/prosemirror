import {defineOption} from "../edit"
import {updateCommands, Command, CommandSet} from "../edit/command"
import {TextSelection} from "../edit/selection"
import {Textblock} from "../model"
import {Pos} from "../model"

defineOption("find", false, (pm, value) => {
  if (pm.mod.find) {
    pm.mod.find.detach()
    pm.mod.find = null
  }

  if (value) {
    pm.mod.find = new Find(pm, value)
  }

})

function findInNode(node, term, path = []) {
  let ret = []
  if(node.type instanceof Textblock) {
    let index = 0, foundAt
    while((foundAt = node.textContent.slice(index).indexOf(term)) > -1) {
      ret.push(new TextSelection(new Pos(path, index + foundAt), new Pos(path, index + foundAt + term.length)))
      index = index + foundAt + term.length;
    }
  } else {
    node.content.forEach((child, i) => ret = ret.concat(findInNode(child, term, path.concat(i))))
  }
  return ret
}

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

CommandSet.find = CommandSet.empty.add({
  find: {
    label: "Find occurances of a string",
    run: function(pm, findTerm) {
      pm.mod.find.findTerm = findTerm
      let selections = findInNode(pm.doc, findTerm)
      selectNext(pm, selections)
      if(pm.mod.find.options.highlightAll) {
        selections.forEach(selection => pm.markRange(selection.from, selection.to, {className:'find'}))
      }
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find..."}
    ],
    keys: ["Mod-F"]
  },
  findNext: {
    label: "Find next occurance of last searched string",
    run: function(pm) {
      if(pm.mod.find.findTerm) {
        let selections = findInNode(pm.doc, pm.mod.find.findTerm)
        selectNext(pm, selections)
      }
    },
    keys: ["Alt-Mod-F"]
  },
  replace: {
    label: "Replaces selected/next occurance of a string",
    run: function(pm, findTerm, replaceWith) {
      if(pm.doc.sliceBetween(pm.selection.from, pm.selection.to).textContent !== findTerm) {
        if(!selectNext(pm, findInNode(pm.doc, findTerm))) {
          return
        }
      }
      pm.tr.typeText(replaceWith).apply()
      selectNext(pm, findInNode(pm.doc, findTerm))
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find..."},
      {label: "Replace", type: "text", defaultLabel: "Replace With..."}
    ],
    keys: ["Mod-H", "Shift-Mod-F"]
  },
  replaceAll: {
    label: "Replaces all occurances of a string",
    run: function(pm, findTerm, replaceWith) {
      let selections = findInNode(pm.doc, findTerm),
          selection, transform;
      while(selection = selections.shift()) {
        pm.setSelection(selection)
        transform = pm.tr.typeText(replaceWith).apply()
        selections = selections.map(s => s.map(pm.doc, transform.maps[0]))
        console.log(selections)
      }
    },
    params: [
      {label: "Find", type: "text", defaultLabel: "Find..."},
      {label: "Replace", type: "text", defaultLabel: "Replace With..."}
    ],
    keys: ["Shift-Mod-H", "Shift-Alt-Mod-F"]
  }
})


class Find {
  constructor(pm, options) {
    this.pm = pm
    this.findTerm = null
    this.options = options
    pm.mod.find = this

    updateCommands(pm, CommandSet.find)
  }

  detach() {

  }


}
