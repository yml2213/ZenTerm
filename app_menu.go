package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func buildApplicationMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenu()
	zenTermMenu := appMenu.AddSubmenu("ZenTerm")

	zenTermMenu.AddText("检查更新...", keys.CmdOrCtrl("u"), func(*menu.CallbackData) {
		app.emitEvent("update:check-requested", nil)
	})
	zenTermMenu.AddSeparator()
	zenTermMenu.AddText("退出", keys.CmdOrCtrl("q"), func(*menu.CallbackData) {
		if app.ctx != nil {
			runtime.Quit(app.ctx)
		}
	})

	appMenu.Append(menu.EditMenu())
	appMenu.Append(menu.WindowMenu())

	return appMenu
}
