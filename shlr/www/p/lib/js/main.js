var myLayout;

$(document).ready( function() {
  // create tabs FIRST so elems are correct size BEFORE Layout measures them
  $("#main_panel").tabs({
    select: function( event, ui ) {
      if (ui.tab.innerHTML.indexOf("Entropy") > -1) r2ui._ent.render();
      else if(ui.tab.innerHTML.indexOf("Strings") > -1) r2ui._str.render();
      else if(ui.tab.innerHTML.indexOf("Settings") > -1) r2ui._set.render();
      else if(ui.tab.innerHTML.indexOf("Projects") > -1) r2ui._prj.render();
    },
    activate: function( event, ui ) {
      if ( ui.newTab[0].innerHTML.indexOf("Hex") > -1 || ui.newTab[0].innerHTML.indexOf("Disas") > -1 ) {
        r2ui.seek("$$", false);
        scroll_to_element(r2ui._dis.selected);
      }
    }
  });

  // Layout
  myLayout = $('body').layout({
    west__size:     200,
    east__size:     200,
    south__size:    200,
    north__resizable: false,
    center__onresize: function () {if (r2ui._dis.display == "graph" && r2ui._dis.minimap) update_minimap();},
    west__onresize:   $.layout.callbacks.resizePaneAccordions,
    east__onresize:   $.layout.callbacks.resizePaneAccordions
  });
  // myLayout.disableClosable("north", true);
  $("#accordion1").accordion({ heightStyle:  "fill" });
  $("#accordion2").accordion({ heightStyle:  "fill" });

  // Boot r2 analysis, settings, ....
  r2.update_flags();
  r2.analAll();
  r2.load_mmap();
  r2ui.load_colors();
  r2.load_settings();
  load_binary_details();

  // Create panels
  var disasm_panel = new DisasmPanel();
  var hex_panel = new HexPanel();
  var entropy_panel = new EntropyPanel();
  var strings_panel = new StringsPanel();
  var settings_panel = new SettingsPanel();
  var projects_panel = new ProjectsPanel();
  r2ui._ent = entropy_panel;
  r2ui._dis = disasm_panel;
  r2ui._str = strings_panel;
  r2ui._set = settings_panel;
  r2ui._hex = hex_panel;
  r2ui._prj = projects_panel;

  // For enyo compatibility
  r2ui.ra = {};
  r2ui.mp = {};
  r2ui.ra.getIndex = function() {};
  r2ui.ra.setIndex = function() {};
  r2ui.mp.openPage = function() {};

  var console_history = [];
  var console_history_idx = 0;

  // Handle commands in console
  $("#command").keypress(function( inEvent ) {
    var key = inEvent.keyCode || inEvent.charCode || inEvent.which || 0;
    if (key === 13) {
      var cmd = inEvent.target.value.trim();
      var reloadUI = cmd == '';

      console_history[console_history.length] = cmd;
      console_history_idx += 1;
      /* empty input reloads UI */
      if (cmd != '') {
        if (r2ui.console_lang == "r2") {
          r2.cmd(inColor(cmd), function(x) {
            var old_value = $("#cmd_output").text();
            $("#cmd_output").html(old_value + "\n> " + cmd + "\n" + x );
            $('#cmd_output').scrollTo($('#cmd_output')[0].scrollHeight);
          });
          if (cmd.indexOf("s ") === 0) {
            r2ui.history_push(r2ui._dis.selected_offset);
          }
        } else if (r2ui.console_lang == "js") {
          x = eval(cmd);
          var old_value = $("#cmd_output").text();
          $("#cmd_output").html(old_value + "\n> " + cmd + "\n" + x );
          $('#cmd_output').scrollTo($('#cmd_output')[0].scrollHeight);
        }
      }
      inEvent.target.value = "";
      /* if command starts with :, do not reload */
      if (reloadUI && r2ui.console_lang == "r2") {
        r2.load_settings();
        r2ui.load_colors();
        update_binary_details();
        r2ui.seek("$$", false);
        scroll_to_element(r2ui._dis.selected);
      }
    }
  });

  $('input').bind('keydown', function(e){
      if(e.keyCode == '38' || e.keyCode == '40'){
          e.preventDefault();
      }
  });
  $("#command").keydown(function( inEvent ) {
    var key = inEvent.keyCode || inEvent.charCode || inEvent.which || 0;
    if (key === 40) {
      console_history_idx++;
      if (console_history_idx > console_history.length - 1) console_history_idx = console_history.length;
      inEvent.target.value = console_history[console_history_idx] === undefined ? "" : console_history[console_history_idx];
    }
    if (key === 38) {
      console_history_idx--;
      if (console_history_idx < 0) console_history_idx = 0;
      inEvent.target.value = console_history[console_history_idx] === undefined ? "" : console_history[console_history_idx];
    }
  });
  // Context menu for addresses:
  $(document).contextmenu({
      delegate: ".addr",
      menu: [
          {title: "jump to address<kbd>g</kbd>", cmd: "goto"},
          {title: "rename<kbd>n</kbd>", cmd: "rename"},
          {title: "add comment<kbd>;</kbd>", cmd: "comment"},
          {title: "code<kbd>c</kbd>", cmd: "define"},
          {title: "undefine<kbd>u</kbd>", cmd: "undefine"},
          {title: "random colors<kbd>R</kbd>", cmd: "randomcolors"},
          {title: "switch disasm/graph<kbd>s</kbd>", cmd: "switchview"}
      ],
      preventSelect: true,
      taphold: true,
      preventContextMenuForPopup: true,
      show: false,
      position: function(event, ui){
        return {my: "left+100 top-10", at: "left bottom", of: ui.target};
      },
      beforeOpen: function(event, ui) {
        var address = get_address_from_class(ui.target[0]);
        var xrefs_to = [];
        var xrefs_from = [];
        var xrefto_submenu = null;
        var xreffrom_submenu = null;
        r2.cmd("axf @" + address, function(x){
          var lines = x.split('\n');
          for (var l in lines) {
            if (lines[l] !== "") xrefs_to[xrefs_to.length] = lines[l];
          }
        });
        if (xrefs_to.length > 0) {
          $(document).contextmenu("showEntry", "xrefs_to", true);
          var refs = [];
          for (var r in xrefs_to) {
            var addr = xrefs_to[r].split(' ')[1];
            var type = xrefs_to[r].split(' ')[0];
            refs[refs.length] = {title: addr + "<kbd>" + type + "</kbd>", cmd: "jumpto_" + addr};
          }
          var xrefto_submenu = {title: "xrefs to", children: refs};
        }
        r2.cmd("axt @" + address, function(x){
          var lines = x.split('\n');
          for (var l in lines) {
            if (lines[l] !== "") xrefs_from[xrefs_from.length] = lines[l];
          }
        });
        if (xrefs_from.length > 0) {
          $(document).contextmenu("showEntry", "xrefs_from", true);
          var refs = [];
          for (var r in xrefs_from) {
            var addr = xrefs_from[r].split(' ')[1];
            var type = xrefs_from[r].split(' ')[0];
            refs[refs.length] = {title: addr + "<kbd>" + type + "</kbd>", cmd: "jumpto_" + addr};
          }
          var xreffrom_submenu = {title: "xrefs from", children: refs};
        }
        var menu = [
            {title: "jump to address<kbd>g</kbd>", cmd: "goto"},
            {title: "rename<kbd>n</kbd>", cmd: "rename"},
            {title: "add comment<kbd>;</kbd>", cmd: "comment"},
            {title: "code<kbd>c</kbd>", cmd: "define"},
            {title: "undefine<kbd>u</kbd>", cmd: "undefine"},
            {title: "random colors<kbd>R</kbd>", cmd: "randomcolors"},
            {title: "switch disasm/graph<kbd>s</kbd>", cmd: "switchview"}
        ];
        if (xreffrom_submenu !== null || xrefto_submenu !== null) {
          if (xrefto_submenu !== null) menu[menu.length] = xrefto_submenu;
          if (xreffrom_submenu !== null) menu[menu.length] = xreffrom_submenu;
        }
        $(document).contextmenu("replaceMenu", menu);

        r2.cmdj("pdj 1 @" + address, function(x) {
          if(x) {
            if(x[0].fcn_addr == x[0].offset) {
              $(document).contextmenu("showEntry", "define", false);
              $(document).contextmenu("showEntry", "undefine", true);
            } else {
              $(document).contextmenu("showEntry", "define", true);
              $(document).contextmenu("showEntry", "undefine", false);
            }
          }
        });

        if (ui.target.hasClass('insaddr')) {
          $(document).contextmenu("showEntry", "comment", true);
          $(document).contextmenu("showEntry", "rename", true);
        } else {
          $(document).contextmenu("showEntry", "comment", false);
          $(document).contextmenu("showEntry", "rename", true);
          $(document).contextmenu("showEntry", "define", false);
          $(document).contextmenu("showEntry", "undefine", false);
        }
        if (ui.target.hasClass('reloc') || ui.target.hasClass('symbol') || ui.target.hasClass('import')) {
          $(document).contextmenu("showEntry", "comment", false);
          $(document).contextmenu("showEntry", "rename", false);
          $(document).contextmenu("showEntry", "define", false);
          $(document).contextmenu("showEntry", "undefine", false);
        }
        // Context manu on disasm panel
        if (!$.contains($("#disasm_tab")[0], ui.target[0])) {
          $(document).contextmenu("showEntry", "switchview", false);
        }
      },
      select: function(event, ui) {
        $(document).contextmenu("close");
        var target = ui.target[0];
        var address = get_address_from_class(target);
        if (ui.cmd.indexOf("jumpto_") == 0) {
          address = ui.cmd.substring(ui.cmd.indexOf("jumpto_") + 7);
          do_jumpto(address);
        }
        switch (ui.cmd) {
          case "goto": do_goto(); break;
          case "comment": do_comment(target); break;
          case "rename": do_rename(target, event); break;
          case "define": do_define(target); break;
          case "undefine": do_undefine(target); break;
          case "randomcolors": do_randomcolors(target); break;
          case "switchview": do_switchview(target); break;
        }
      }
  });

  // Console menu
  $("#console_panel").contextmenu({
    menu: [
      {title: "clear buffer<kbd></kbd>", cmd: "clearbuffer"},
      {title: "switch r2/JS<kbd>s</kbd>", cmd: "switchlang"}
    ],
    preventSelect: true,
    taphold: true,
    preventContextMenuForPopup: true,
    show: false,
    select: function(event, ui) {
      $(document).contextmenu("close");
      switch (ui.cmd) {
        case "clearbuffer": $("#cmd_output").html(""); break;
        case "switchlang": r2ui.toggle_console_lang(); break;
      }
    }
  });

  // Install keyboard and mouse handlers
  $(document).keypress(handleKeypress);
  $(document).click(handleClick);
  $(document).dblclick(handleDoubleClick);

  // Show disasm panel and seek to entrypoint
  disasm_panel.display_flat();
  r2ui.seek(disasm_panel.base,true);
  scroll_to_element(r2ui._dis.selected);

  // Infinite scroll
  $("#center_panel").scroll(on_scroll);

  // Project notes
  r2.cmdj("Pnj", function(x){
    if (x !== null) $("#pnotes").html(atob(x));
  });
  $("#pnotes").donetyping(function() {
    r2.cmd("Pnj " + btoa($("#pnotes").val()));
    r2.cmd("Po", function(x) {
      if (x === "") alert("Notes won't be persited until a project is opened. Use Project's tab or 'Ps name' to save current project");
    });
  });
});

function scroll_to_element(element) {
  if (element === undefined) return;
  var top = Math.max(0,element.documentOffsetTop() - ( window.innerHeight / 2 ));
  $('#center_panel').scrollTo(top, {axis: 'y'});
  r2ui._dis.scroll_offset = top;
}

function scroll_to_address(address) {
  if (address === undefined) return;
  var elements = $(".insaddr.addr_" + address);
  var top = elements[0].documentOffsetTop() - ( window.innerHeight / 2 );
  top = Math.max(0,top);
  $('#center_panel').scrollTo(top, {axis: 'y'});
  r2ui._dis.scroll_offset = top;
}

function store_scroll_offset() {
  r2ui._dis.scroll_offset = $('#center_panel').scrollTop();
}
function scroll_to_last_offset() {
  if (r2ui._dis.scroll_offset !== null) $('#center_panel').scrollTo(r2ui._dis.scroll_offset, {axis: 'y'});
}

// key handler
function handleKeypress(inEvent) {
  var keynum = inEvent.keyCode || inEvent.charCode || inEvent.which || 0;
  var key = String.fromCharCode(keynum);
  // console.log(key);

  if (inEvent.ctrlKey||inEvent.metaKey) return;
  if ($(inEvent.target).prop("tagName") === "INPUT" || $(inEvent.target).prop("tagName") === "TEXTAREA") return;

  if (r2ui._dis.renaming !== null) return;

  // Spacebar Switch flat and graph views
  if (key === ' ') {
    do_switchview();
    inEvent.preventDefault();
  }

  if (key === 'm' && r2ui._dis.display == "graph") toggle_minimap();

  // h Seek to previous address in history
  if (key === 'h') do_jumpto(r2ui.history_prev());

  // l Seek to next address in history
  if (key === 'l') do_jumpto(r2ui.history_next());

  // j Seek to next Instruction
  if (key === 'j') {
    var get_more_instructions = false;
    if ($(r2ui._dis.selected).hasClass("insaddr")) {
      var next_instruction;
      if (r2ui._dis.display == "flat") {
        next_instruction = $(r2ui._dis.selected).closest(".instructionbox").next().find('.insaddr')[0];
        if ($("#gbox .instructionbox").index( $(r2ui._dis.selected).closest(".instructionbox")[0]) > $("#gbox .instructionbox").length - 10) get_more_instructions = true;
      }
      if (r2ui._dis.display == "graph") {
        var next_instruction = $(r2ui._dis.selected).closest(".instruction").next().find('.insaddr')[0];
        if (next_instruction === undefined || next_instruction === null) {
          next_instruction = $(r2ui._dis.selected).closest(".basicblock").next().find('.insaddr')[0];
        }
      }

      // if (next_instruction === null || next_instruction === undefined) return;
      var address = get_address_from_class(next_instruction);
      if (get_more_instructions) {
        r2ui.seek(address, false);
      } else {
        r2ui.history_push(address);
        render_history();
        r2ui._dis.selected = next_instruction;
        r2ui._dis.selected_offset = address;
      }
      rehighlight_iaddress(address);
      scroll_to_address(address);
    }
  }
  // k Seek to previous instruction
  if (key === 'k') {
    var get_more_instructions = false;
    if ($(r2ui._dis.selected).hasClass("insaddr")) {
      var prev_instruction;
      if (r2ui._dis.display == "flat") {
        prev_instruction = $(r2ui._dis.selected).closest(".instructionbox").prev().find('.insaddr')[0];
        if ($("#gbox .instructionbox").index( $(r2ui._dis.selected).closest(".instructionbox")[0]) < 10) get_more_instructions = true;
      }
      if (r2ui._dis.display == "graph") {
        var prev_instruction = $(r2ui._dis.selected).closest(".instruction").prev().find('.insaddr')[0];
        if (prev_instruction === undefined || prev_instruction === null) {
          prev_instruction = $(r2ui._dis.selected).closest(".basicblock").prev().find('.insaddr').last()[0];
        }
      }
      var address = get_address_from_class(prev_instruction);
      if (get_more_instructions) {
        r2ui.seek(address, false);
      } else {
        r2ui.history_push(address);
        render_history();
        r2ui._dis.selected = prev_instruction;
        r2ui._dis.selected_offset = address;
      }
      rehighlight_iaddress(address);
      scroll_to_address(address);
    }
  }
  // c Define function
  if (key === 'c') do_define(r2ui._dis.selected);

  // u Clear function metadata
  if (key === 'u') do_undefine(r2ui._dis.selected);

  // g Go to address
  if (key === 'g') {
    var a = prompt('Go to');
    if (a !== null) do_jumpto(a);
  }

  // ; Add comment
  if (key === ';') do_comment(r2ui._dis.selected);

  // n Rename
  if (key === 'n') do_rename(r2ui._dis.selected, inEvent);

  if (key === 'R') do_randomcolors();

  // esc
  if (keynum === 27) {
    // Esc belongs to renaming
    if(r2ui._dis.renaming !== null) {
      r2ui._dis.renaming.innerHTML = r2ui._dis.renameOldValue;
      r2ui._dis.renaming = null;
    } else {
      // go back in history
      var addr = r2ui.history_prev();
      if (addr !== undefined && addr !== null) r2ui.seek(addr, false);
      scroll_to_address(addr);
    }
  }
  // enter
  if (keynum === 13) {
    r2ui._dis.goToAddress();
  }
}

function do_switchview() {
    var address = get_address_from_class(r2ui._dis.selected);
    if (address !== undefined && address !== null) {
      if (r2ui._dis.display === "flat") r2ui._dis.display_graph();
      else if (r2ui._dis.display === "graph") r2ui._dis.display_flat();
      r2ui.seek(address, true);
      scroll_to_address(address);
    }
}

function do_jumpto(address) {
  var element = $('.insaddr.addr_' + address);
  if (element.length > 0) {
    r2ui.history_push(address);
    r2ui._dis.selected = element[0];
    r2ui._dis.selected_offset = address;
    render_history();
  } else {
    r2ui.seek(address, true);
  }
  rehighlight_iaddress(address);
  scroll_to_address(address);
}

function do_rename(element, inEvent) {
  var address = get_address_from_class(element);
  if ($(element).hasClass("addr") && $(element).hasClass("flag")) {
     var space = "*";
     if ($(element).hasClass("function")) space = "functions";
     if ($(element).hasClass("import")) space = "functions";
     if ($(element).hasClass("symbol")) space = "symbols";
     if ($(element).hasClass("reloc")) space = "relocs";
     if ($(element).hasClass("section")) space = "sections";
     if ($(element).hasClass("string")) space = "strings";
     var old_value = $(element).html();
     var new_name = prompt('New name', old_value);
     if (new_name !== null) {
       rename(address, old_value, new_name, space);
       store_scroll_offset();
       r2ui.seek("$$", false);
       scroll_to_last_offset();
     }
  } else if (r2ui._dis.renaming === null && element !== null && $(element).hasClass("addr")) {
    r2ui._dis.selected = element;
    r2ui._dis.selected_offset = address;
    r2ui._dis.renaming = element;
    r2ui._dis.renameOldValue = element.innerHTML;
    r2ui._dis.rbox = document.createElement('input');
    r2ui._dis.rbox.setAttribute("type", "text");
    r2ui._dis.rbox.setAttribute("id", "rename");
    r2ui._dis.rbox.setAttribute("style", "border-width: 0;padding: 0;");
    r2ui._dis.rbox.setAttribute("onChange", "handleInputTextChange()");
    if ($(element).hasClass('insaddr')) {
      var value = get_offset_flag(address);
      r2ui._dis.rbox.setAttribute("value",value);
      r2ui._dis.rbox.setSelectionRange(value.length, value.length);
    } else {
      r2ui._dis.rbox.setAttribute("value", r2ui._dis.renameOldValue);
      r2ui._dis.rbox.setSelectionRange(r2ui._dis.renameOldValue.length, r2ui._dis.renameOldValue.length);
    }
    r2ui._dis.renaming.innerHTML = "";
    r2ui._dis.renaming.appendChild(r2ui._dis.rbox);
    setTimeout('r2ui._dis.rbox.focus();', 200);
    inEvent.returnValue=false;
    inEvent.preventDefault();
  } else if (r2ui._dis.renaming === null && element !== null && $(element).hasClass("faddr")) {
    address = get_address_from_class(element, "faddr");
    r2ui._dis.selected = element;
    r2ui._dis.selected_offset = address;
    r2ui._dis.renaming = element;
    r2ui._dis.renameOldValue = element.innerText;
    r2ui._dis.rbox = document.createElement('input');
    r2ui._dis.rbox.setAttribute("type", "text");
    r2ui._dis.rbox.setAttribute("id", "rename");
    r2ui._dis.rbox.setAttribute("style", "border-width: 0;padding: 0;");
    r2ui._dis.rbox.setAttribute("onChange", "handleInputTextChange()");
    r2ui._dis.rbox.setAttribute("value", r2ui._dis.renameOldValue);
    r2ui._dis.rbox.setSelectionRange(r2ui._dis.renameOldValue.length, r2ui._dis.renameOldValue.length);
    r2ui._dis.renaming.innerHTML = "";
    r2ui._dis.renaming.appendChild(r2ui._dis.rbox);
    setTimeout('r2ui._dis.rbox.focus();', 200);
    inEvent.returnValue=false;
    inEvent.preventDefault();
  }
  update_binary_details();
}

function do_comment(element) {
  var address = get_address_from_class(element);
  var c =  prompt('Comment');
  if (c !== null) {
    r2.cmd('CC ' + c  + " @ " + address);
    r2ui.seek(address, false);
    scroll_to_address(address);
  }
}

function do_undefine(element) {
  var address = get_address_from_class(element);
  r2.cmd("af-");
  r2.update_flags();
  update_binary_details();
  if (r2ui._dis.display == "graph") r2ui._dis.display_flat();
  r2ui.seek(address, false);
  scroll_to_address(address);
}

function do_define(element) {
  var address = get_address_from_class(element);
  var msg = prompt ('Function name?');
  if (msg !== null) {
    r2.cmd("af " + msg + " @ " + address);
    r2.update_flags();
    update_binary_details();
    r2ui.seek(address, false);
    scroll_to_address(address);
  }
}

function handleClick(inEvent) {

  if ($(inEvent.target).hasClass('addr')) {
      if ($(inEvent.target).hasClass('history')) {
        var idx = inEvent.target.className.split(" ").filter(function(x) { return x.substr(0,"history_idx_".length) == "history_idx_"; });
        idx = String(idx).split("_")[2];
        r2ui.history_idx = idx;
        do_jumpto(r2ui.history[idx]);
      } 
      // If instruction address, add address to history
      else if ($(inEvent.target).hasClass('insaddr')) {
        var address = get_address_from_class(inEvent.target);
        r2ui._dis.selected = inEvent.target;
        r2ui._dis.selected_offset = address;
        rehighlight_iaddress(address);

        r2ui.history_push(address);
        render_history();
        var get_more_instructions = false;
        var next_instruction;
        var prev_instruction;
        var address;
        if (r2ui._dis.display == "flat") {
          next_instruction = $(r2ui._dis.selected).closest(".instructionbox").next().find('.insaddr')[0];
          if ($("#gbox .instructionbox").index( $(r2ui._dis.selected).closest(".instructionbox")[0]) > $("#gbox .instructionbox").length - 10) {
            get_more_instructions = true;
            address = get_address_from_class(next_instruction);
          }
          prev_instruction = $(r2ui._dis.selected).closest(".instructionbox").prev().find('.insaddr')[0];
          if ($("#gbox .instructionbox").index( $(r2ui._dis.selected).closest(".instructionbox")[0]) < 10) {
            get_more_instructions = true;
            address = get_address_from_class(prev_instruction);
          }
        }
        if (r2ui._dis.display == "graph") {
          var next_instruction = $(r2ui._dis.selected).closest(".instruction").next().find('.insaddr')[0];
          if (next_instruction === undefined || next_instruction === null) {
            next_instruction = $(r2ui._dis.selected).closest(".basicblock").next().find('.insaddr')[0];
          }
          var prev_instruction = $(r2ui._dis.selected).closest(".instruction").prev().find('.insaddr')[0];
          if (prev_instruction === undefined || prev_instruction === null) {
            prev_instruction = $(r2ui._dis.selected).closest(".basicblock").prev().find('.insaddr').last()[0];
          }
        }
        if (get_more_instructions) {
          r2ui.seek(address, false);
          rehighlight_iaddress(address);
          scroll_to_address(address);
        }
      }
  } else if ($(inEvent.target).hasClass('fvar') || $(inEvent.target).hasClass('farg')) {
    var eid = null;
    var address = get_address_from_class(inEvent.target, "faddr");
    r2ui._dis.selected = inEvent.target;
    r2ui._dis.selected_offset = address;
    var classes = inEvent.target.className.split(' ');
    for (var j in classes) {
      var klass = classes[j];
      if (klass.indexOf("id_") === 0) eid = klass.substring(3);
    }
    if (eid !== null) rehighlight_iaddress(eid, "id");
  }
}

function handleDoubleClick (inEvent) {
  if ($(inEvent.target).hasClass('addr') && !$(inEvent.target).hasClass('insaddr')) {
    var address = get_address_from_class(inEvent.target);
    do_jumpto(address);
  }
}

function load_binary_details() {
  // <div id="symbols"></div>
  r2.cmdj("isj", function(x) {
    render_symbols(x);
  });
  // <div id="functions"></div>
  r2.cmdj("afj", function(x) {
    render_functions(x);
  });
  // <div id="imports"></div>
  r2.cmdj("iij", function(x) {
    render_imports(x);
  });
  // <div id="relocs"></div>
  r2.cmdj("irj", function(x) {
    render_relocs(x);
  });
  // <div id="flags"></div>
  // TODO: replace with individual fetches of spaces so we can add a class saying what type of flag it is (for renaming)
  r2.cmdj("fs *;fj", function(x) {
    render_flags(x);
  });
  // <div id="information"></div>
  r2.cmd("i", function(x) {
    $('#information').html("<pre>" + x + "</pre>");
  });
  // <div id="sections"></div>
  r2.cmdj("iSj", function(x) {
    render_sections(x);
  });
  render_history();
}

function update_binary_details() {
  // <div id="symbols"></div>
  r2.cmdj("isj", function(x) {
    render_symbols(x);
  });
  // <div id="functions"></div>
  r2.cmdj("afj", function(x) {
    render_functions(x);
  });
  // <div id="imports"></div>
  r2.cmdj("iij", function(x) {
    render_imports(x);
  });
  // <div id="relocs"></div>
  r2.cmdj("irj", function(x) {
    render_relocs(x);
  });
  // <div id="flags"></div>
  // TODO: replace with individual fetches of spaces so we can add a class saying what type of flag it is (for renaming)
  r2.cmdj("fs *;fj", function(x) {
    render_flags(x);
  });
  render_history();
}

function render_functions(functions) {
  var imports = null;
  r2.cmdj("iij", function(x) {
    imports = x;
  });
  var fcn_data = [];
  for (var i in functions) {
    var f = functions[i];
    if (f.name !== undefined) {
      var is_import = false;
      for (var k in imports) if (f.offset === imports[k].plt) is_import = true;
      if (is_import) continue;
      var fd = {
        offset: f.offset,
        label: "<span class='flag function addr addr_" + "0x" + f.offset.toString(16) + "'>" + f.name + "</span>",
        children: [{label: "offset: " + "0x" + f.offset.toString(16)},  {label: "size: " + f.size} ]
      };
      if (f.callrefs.length > 0) {
        var xrefs = {label: "xrefs:", children: []};
        for (var j in f.callrefs) {
          xrefs.children[xrefs.children.length] = "<span class='xref addr addr_0x" + f.callrefs[j].addr.toString(16)  + "'>0x" + f.callrefs[j].addr.toString(16) + "</span> (" + (f.callrefs[j].type == "C"? "call":"jump") + ")";
        }
        fd.children[fd.children.length] = xrefs;
      }
      fcn_data[fcn_data.length] = fd;
    }
  }
  fcn_data = fcn_data.sort(function(a,b) {return a.offset - b.offset;});
  $('#functions').tree({data: [],selectable: false,slide: false,useContextMenu: false, autoEscape: false});
  $('#functions').tree('loadData', fcn_data);
  $('#functions_label').html("Functions <span class='right_label'>" + fcn_data.length + "</span>");
}

function render_imports(imports) {
  var imp_data = [];
  for (var i in imports) {
    var f = imports[i];
    f.name = decodeURI (f.name);
    if (f.name !== undefined) {
      var id = {
        label: "<span class='flag import addr addr_" + "0x" + f.plt.toString(16) + "'>" + f.name + "</span>",
        children: [ {label: "plt: " + "0x" + f.plt.toString(16)}, {label: "ord: " + i} ]
      };
      imp_data[imp_data.length] = id;
    }
  }
  $('#imports').tree({data: [],selectable: false,slide: false,useContextMenu: false, autoEscape: false});
  $('#imports').tree('loadData', imp_data);
  $('#imports_label').html("Imports <span class='right_label'>" + imp_data.length + "</span>");
}


function render_symbols(symbols) {
  var data = [];
  for (var i in symbols) {
    var s = symbols[i];
    s.name = decodeURI (s.name);
    var sd = {
      offset: s.addr,
      label: "<span class='flag symbol addr addr_" + "0x" + s.addr.toString(16) + "'>" + s.name + "</span>",
      children: [ {label: "offset: " + "0x" + s.addr.toString(16)}, {label: "size: " + s.size} ] };
    data[data.length] = sd;
  }
  data = data.sort(function(a,b) {return a.offset - b.offset;});
  $('#symbols').tree({data: data,selectable: false,slide: false,useContextMenu: false, autoEscape: false});
  $('#symbols_label').html("Symbols <span class='right_label'>" + data.length + "</span>");
}
function render_relocs(relocs) {
  var data = [];
  for (var i in relocs) {
    var r = relocs[i];
    var rd = {
      offset: r.vaddr,
      label: "<span class='flag reloc addr addr_" + "0x" + r.vaddr.toString(16) + "'>" + r.name + "</span>",
      children: [ {label: "offset: " + "0x" + r.vaddr.toString(16)}, {label: "type: " + r.type} ] };
    data[data.length] = rd;
  }
  data = data.sort(function(a,b) {return a.offset - b.offset;});
  $('#relocs').tree({data: [],selectable: false,slide: false,useContextMenu: false, autoEscape: false});
  $('#relocs').tree('loadData', data);
  $('#relocs_label').html("Relocs <span class='right_label'>" + data.length + "</span>");
}
function render_flags(flags) {
  var data = [];
  for (var i in flags) {
    var f = flags[i];
    var fd = {
      offset: f.offset,
      label: "<span class='flag addr addr_" + "0x" + f.offset.toString(16) + "'>" + f.name + "</span>",
      children: [ {label: "offset: " + "0x" + f.offset.toString(16)}, {label: "size: " + f.size} ] };
    data[data.length] = fd;
  }
  data = data.sort(function(a,b) {return a.offset - b.offset;});
  $('#flags').tree({data: [],selectable: false,slide: false,useContextMenu: false, autoEscape: false});
  $('#flags').tree('loadData', data);
  $('#flags_label').html("Flags <span class='right_label'>" + data.length + "</span>");
}
function render_sections(sections) {
  var data = [];
  for (var i in sections) {
    var f = sections[i];
    var fd = {
      offset: f.paddr,
      label: "0x" + f.addr.toString(16) + ": " + f.name,
      children: [
        {label: "vaddr: " + "0x" + f.vaddr.toString(16)},
        {label: "paddr: " + "0x" + f.paddr.toString(16)},
        {label: "flags: " + f.flags},
        {label: "size: " + f.size},
        {label: "vsize: " + f.vsize}
      ]
    };
    data[data.length] = fd;
  }
  data = data.sort(function(a,b) {return a.offset - b.offset;});
  $('#sections').tree({data: [],selectable: false,slide: false,useContextMenu: false});
  $('#sections').tree('loadData', data);
  $('#sections_label').html("Sections <span class='right_label'>" + data.length + "</span>");
}
function render_history(){
  var html = "<div>";
  for (var i in r2ui.history) {
    if (i > r2ui.history_idx - 10 && i < r2ui.history_idx + 5) {
      var flag = r2.get_flag_names(r2ui.history[i]);
      if (flag.length > 0) flag = flag[0];
      else flag = r2ui.history[i];
      if (i == r2ui.history_idx - 1) html += " &gt; <span class='history history_idx addr addr_" + r2ui.history[i] + " history_idx_" + i + "'>" + flag + "</span>";
      else html += " &gt;  <span class='history addr addr_" + r2ui.history[i] + " history_idx_" + i + "'>" + flag + "</span>";
    }
  }
  html += "</div>";
  $('#history').html(html);

}
