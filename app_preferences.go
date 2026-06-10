package main

import "zenterm/internal/model"

// GetAppPreferences 读取全局应用偏好 / reads global application preferences.
func (a *App) GetAppPreferences() (model.AppPreferences, error) {
	prefs, err := a.store.GetAppPreferences()
	if err != nil {
		return model.AppPreferences{}, normalizeFrontendError(err)
	}
	return prefs, nil
}

// SaveAppPreferences 保存全局应用偏好 / saves global application preferences.
func (a *App) SaveAppPreferences(prefs model.AppPreferences) error {
	if err := a.store.SaveAppPreferences(prefs); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}
