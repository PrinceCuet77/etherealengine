import React from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@mui/material'

import { useStyle, useStyles } from './style'

const UnauthorisedPage = (props) => {
  const classes = useStyles()
  const classx = useStyle()
  return (
    <div className={classx.paper}>
      <div className={classes.notFound}>
        <p className={classes.typo}>{props.message}</p>
        <Link style={{ textDecoration: 'none' }} to="/location/default">
          <Button className={classes.Btn}>location page</Button>
        </Link>
      </div>
    </div>
  )
}

export default UnauthorisedPage
