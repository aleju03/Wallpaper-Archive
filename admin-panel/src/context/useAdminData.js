import { useContext } from 'react'
import { AdminDataContext } from './adminDataContext'

export const useAdminData = () => useContext(AdminDataContext)
