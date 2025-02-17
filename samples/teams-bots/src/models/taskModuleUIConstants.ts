// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TaskModuleIds } from './taskModuleIds'
import { UISettings } from './uiSettings'

export class TaskModuleUIConstants {
  static AdaptiveCard: UISettings = {
    width: 400,
    height: 200,
    title: 'Adaptive Card: Inputs',
    id: TaskModuleIds.AdaptiveCard,
    buttonTitle: 'Adaptive Card'
  }

  static YouTube: UISettings = {
    width: 1000,
    height: 700,
    title: 'You Tube Video',
    id: TaskModuleIds.YouTube,
    buttonTitle: 'You Tube'
  }

  static CustomForm: UISettings = {
    width: 510,
    height: 450,
    title: 'Custom Form',
    id: TaskModuleIds.CustomForm,
    buttonTitle: 'Custom Form'
  }
}
