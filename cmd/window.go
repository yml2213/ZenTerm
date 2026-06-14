package cmd

import (
	"context"
	"fmt"

	"zenterm/internal/model"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	// 启动后检查更新
	a.startupCheckUpdate()
}

func (a *App) BeforeClose(ctx context.Context) bool {
	a.persistWindowState()
	return false
}

func (a *App) Shutdown(ctx context.Context) {
	a.persistWindowState()
	_ = a.service.CloseAll()
}

// PersistWindowState 主动持久化当前窗口尺寸，供前端在窗口变化后触发保存 / persists the current window metrics on demand for frontend-triggered saves.
func (a *App) PersistWindowState() {
	a.persistWindowState()
}

func (a *App) persistWindowState() {
	if a.ctx == nil || a.store == nil {
		return
	}

	width, height := runtime.WindowGetSize(a.ctx)
	state := model.WindowState{
		Width:     width,
		Height:    height,
		Maximised: runtime.WindowIsMaximised(a.ctx),
	}

	if err := a.store.SaveWindowState(state); err != nil {
		runtime.LogWarning(a.ctx, fmt.Sprintf("save window state: %v", err))
	}
}

func (a *App) emitEvent(event string, payload any) {
	if a.ctx == nil {
		return
	}

	runtime.EventsEmit(a.ctx, event, payload)
}

// buildApplicationMenu 构建应用原生菜单 / builds the native application menu.
func BuildApplicationMenu(app *App) *menu.Menu {
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
